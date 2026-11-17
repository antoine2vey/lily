import { MagicLinkRepositoryLive } from '@lily/api/repositories/magic-link.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { deleteExpiredSignInRows } from '@lily/api/services/auth/cleanup-scheduler'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const fromNow = (millis: number) => new Date(Date.now() + millis)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'deleteExpiredSignInRows - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string
    const run = `auth-cleanup-${Date.now()}`
    const email = `${run}@example.com`

    const RepositoriesLive = Layer.mergeAll(
      MagicLinkRepositoryLive,
      RefreshTokenRepositoryLive
    ).pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const magicLinksLeft = async () => {
      const rows = await db
        .select({ token: schema.magicLinks.token })
        .from(schema.magicLinks)
        .where(eq(schema.magicLinks.email, email))
      return rows.map((row) => row.token.replace(`${run}-`, '')).sort()
    }

    const refreshTokensLeft = async () => {
      const rows = await db
        .select({ tokenHash: schema.refreshTokens.tokenHash })
        .from(schema.refreshTokens)
        .where(eq(schema.refreshTokens.userId, userId))
      return rows.map((row) => row.tokenHash.replace(`${run}-`, '')).sort()
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const [user] = await db
        .insert(schema.users)
        .values({
          email,
          name: 'Auth Cleanup Test User',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      userId = user!.id

      await db.insert(schema.magicLinks).values([
        { email, token: `${run}-live`, expiresAt: fromNow(5 * 60 * 1000) },
        { email, token: `${run}-expired`, expiresAt: fromNow(-2 * HOUR) },
        {
          email,
          token: `${run}-used-and-expired`,
          expiresAt: fromNow(-2 * HOUR),
          usedAt: fromNow(-2 * HOUR),
        },
      ])

      await db.insert(schema.refreshTokens).values([
        { userId, tokenHash: `${run}-live`, expiresAt: fromNow(29 * DAY) },
        { userId, tokenHash: `${run}-expired`, expiresAt: fromNow(-DAY) },
        {
          userId,
          tokenHash: `${run}-revoked-not-expired`,
          expiresAt: fromNow(20 * DAY),
          revokedAt: fromNow(-2 * DAY),
        },
        {
          userId,
          tokenHash: `${run}-old-but-not-expired`,
          expiresAt: fromNow(50 * DAY),
          createdAt: fromNow(-40 * DAY),
        },
      ])
    })

    afterAll(async () => {
      await db
        .delete(schema.magicLinks)
        .where(inArray(schema.magicLinks.email, [email]))
      await db.execute(sql`DELETE FROM users WHERE id = ${userId}`)
      await pool.end()
    })

    it('deletes the expired rows and keeps every row that can still sign in', async () => {
      await Effect.runPromise(
        deleteExpiredSignInRows.pipe(Effect.provide(RepositoriesLive))
      )

      expect(await magicLinksLeft()).toEqual(['live'])
      expect(await refreshTokensLeft()).toEqual([
        'live',
        'old-but-not-expired',
        'revoked-not-expired',
      ])
    })
  }
)
