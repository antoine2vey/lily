import {
  FollowRepository,
  FollowRepositoryLive,
} from '@lily/api/repositories/follow.repository'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'FollowRepository.searchUsers - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const run = Date.now().toString(36)
    const ids: string[] = []

    const RepoLive = FollowRepositoryLive.pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const search = (query: string) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FollowRepository
          const { items } = yield* repo.searchUsers({
            query,
            currentUserId: '00000000-0000-0000-0000-000000000000',
            limit: 50,
          })
          return Array.map(items, (item) => item.name)
        }).pipe(Effect.provide(RepoLive))
      )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const users: ReadonlyArray<typeof schema.users.$inferInsert> = Array.map(
        [
          { name: `s${run}_a_b` },
          { name: `s${run}xaxbx` },
          { name: `s${run}_banned`, status: 'banned' as const },
          { name: `s${run}_deleted`, deletedAt: new Date() },
        ],
        (user, i) => ({
          ...user,
          publicProfile: true,
          email: `search-${run}-${i}@example.com`,
          emailVerified: true,
        })
      )
      const rows = await db
        .insert(schema.users)
        .values([...users])
        .returning({ id: schema.users.id })
      ids.push(...Array.map(rows, (row) => row.id))
    })

    afterAll(async () => {
      await db.delete(schema.users).where(inArray(schema.users.id, ids))
      await pool.end()
    })

    it('matches `_` literally instead of as a wildcard', async () => {
      expect(await search(`s${run}_a_b`)).toEqual([`s${run}_a_b`])
    })

    it('leaves out banned and deleted users', async () => {
      expect(await search(`s${run}`)).toEqual([`s${run}_a_b`, `s${run}xaxbx`])
    })
  }
)
