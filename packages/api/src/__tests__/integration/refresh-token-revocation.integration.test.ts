import {
  type IRefreshTokenRepository,
  RefreshTokenRepository,
  RefreshTokenRepositoryLive,
} from '@lily/api/repositories/refresh-token.repository'
import { REFRESH_TOKEN_ROTATION_GRACE_MS } from '@lily/api/services/auth/constants'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'RefreshTokenRepository revocation - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string

    const RepoLive = RefreshTokenRepositoryLive.pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const run = <A>(
      f: (repo: IRefreshTokenRepository) => Effect.Effect<A, unknown>
    ) =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* f(yield* RefreshTokenRepository)
        }).pipe(Effect.provide(RepoLive))
      )

    const issue = async (tokenHash: string) => {
      const token = await run((repo) =>
        repo.create(userId, tokenHash, new Date(Date.now() + 86_400_000))
      )
      return token!
    }

    const findWithGrace = (tokenHash: string) =>
      run((repo) =>
        repo.findValidByTokenHash(tokenHash, REFRESH_TOKEN_ROTATION_GRACE_MS)
      )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `refresh-revocation-${Date.now()}@example.com`,
          name: `refresh-revocation-${Date.now()}`,
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      userId = user!.id
    })

    afterAll(async () => {
      await db.execute(sql`DELETE FROM users WHERE id = ${userId}`)
      await pool.end()
    })

    it('honors a just-rotated token inside the grace window', async () => {
      const hash = `rotated-${Date.now()}`
      const token = await issue(hash)
      await run((repo) => repo.revoke(token.id))

      expect((await findWithGrace(hash))?.id).toBe(token.id)
    })

    it('rejects active and just-rotated tokens right after logout', async () => {
      const activeHash = `logged-out-active-${Date.now()}`
      const rotatedHash = `logged-out-rotated-${Date.now()}`
      await issue(activeHash)
      const rotated = await issue(rotatedHash)
      await run((repo) => repo.revoke(rotated.id))

      await run((repo) => repo.revokeAllForUser(userId))

      expect(await findWithGrace(activeHash)).toBeNull()
      expect(await findWithGrace(rotatedHash)).toBeNull()
    })
  }
)
