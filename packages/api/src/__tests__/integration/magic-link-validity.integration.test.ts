import {
  type IMagicLinkRepository,
  MagicLinkRepository,
  MagicLinkRepositoryLive,
} from '@lily/api/repositories/magic-link.repository'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array as Arr, ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const EMAIL = `magic-link-validity-${Date.now()}@example.com`

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'MagicLinkRepository validity - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>

    const RepoLive = MagicLinkRepositoryLive.pipe(
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
      f: (repo: IMagicLinkRepository) => Effect.Effect<A, unknown>
    ) =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* f(yield* MagicLinkRepository)
        }).pipe(Effect.provide(RepoLive))
      )

    const insertLink = async (fields: { expiresAt: Date; usedAt?: Date }) => {
      const token = crypto.randomUUID()
      await db
        .insert(schema.magicLinks)
        .values({ email: EMAIL, token, ...fields })
      return token
    }

    const usedAtOf = async (token: string) => {
      const [row] = await db
        .select({ usedAt: schema.magicLinks.usedAt })
        .from(schema.magicLinks)
        .where(eq(schema.magicLinks.token, token))
      return row?.usedAt
    }

    const inMinutes = (minutes: number) =>
      new Date(Date.now() + minutes * 60_000)

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    afterAll(async () => {
      await db.execute(sql`DELETE FROM magic_links WHERE email = ${EMAIL}`)
      await pool.end()
    })

    it('refuses an expired link and leaves it unused', async () => {
      const token = await insertLink({ expiresAt: inMinutes(-1) })

      expect(await run((repo) => repo.findValidByToken(token))).toBeNull()
      expect(await run((repo) => repo.findValidAndMarkUsed(token))).toBeNull()
      expect(await usedAtOf(token)).toBeNull()
    })

    it('refuses a link that was already used', async () => {
      const usedAt = inMinutes(-2)
      const token = await insertLink({ expiresAt: inMinutes(10), usedAt })

      expect(await run((repo) => repo.findValidByToken(token))).toBeNull()
      expect(await run((repo) => repo.findValidAndMarkUsed(token))).toBeNull()
      expect(await usedAtOf(token)).toEqual(usedAt)
    })

    it('accepts a fresh link, then refuses it once it is spent', async () => {
      const token = await insertLink({ expiresAt: inMinutes(10) })

      expect((await run((repo) => repo.findValidByToken(token)))?.token).toBe(
        token
      )
      const consumed = await run((repo) => repo.findValidAndMarkUsed(token))
      expect(consumed?.token).toBe(token)
      expect(consumed?.usedAt).toBeInstanceOf(Date)

      expect(await run((repo) => repo.findValidByToken(token))).toBeNull()
      expect(await run((repo) => repo.findValidAndMarkUsed(token))).toBeNull()
    })

    it('lets exactly one of two concurrent verifications spend the link', async () => {
      const token = await insertLink({ expiresAt: inMinutes(10) })

      const results = await run((repo) =>
        Effect.all(
          [repo.findValidAndMarkUsed(token), repo.findValidAndMarkUsed(token)],
          { concurrency: 'unbounded' }
        )
      )

      expect(Arr.filter(results, (link) => link !== null)).toHaveLength(1)
    })
  }
)
