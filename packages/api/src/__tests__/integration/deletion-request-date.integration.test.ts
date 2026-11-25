import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const FAR_FUTURE = new Date('2100-01-01T00:00:00Z')

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'The date of a deletion request across admin status moves - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const ids: string[] = []

    const RepoLive = UserRepositoryLive.pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const withUsers = <A>(
      body: (users: UserRepository['Service']) => Effect.Effect<A, unknown>
    ) =>
      Effect.runPromise(
        Effect.flatMap(UserRepository, body).pipe(Effect.provide(RepoLive))
      )

    const account = async () => {
      const tag = crypto.randomUUID()
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `deletion-date-${tag}@example.com`,
          name: `leaving-${tag}`,
          emailVerified: true,
        })
        .returning({ id: schema.users.id })
      const id = row?.id ?? ''
      ids.push(id)
      return id
    }

    const purgeDateOf = (id: string) =>
      withUsers((users) =>
        Effect.map(users.findExpiredDeletions(FAR_FUTURE), (expired) =>
          Array.map(
            Array.filter(expired, (user) => user.id === id),
            (user) => user.deletedAt
          )
        )
      )

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    afterAll(async () => {
      await db.delete(schema.users).where(inArray(schema.users.id, ids))
      await pool.end()
    })

    it('an account suspended and put back to pending deletion is purged on its first request date', async () => {
      const id = await account()

      const requestedAt = await withUsers((users) =>
        Effect.gen(function* () {
          const requested = yield* users.softDelete(id)
          yield* users.updateStatus(id, 'suspended')
          yield* users.updateStatus(id, 'pending_deletion')
          return requested?.deletedAt
        })
      )

      expect(await purgeDateOf(id)).toEqual([requestedAt])
    })

    it.each([
      [
        'updateStatus',
        (users: UserRepository['Service'], id: string) =>
          users.updateStatus(id, 'pending_deletion'),
      ],
      [
        'update',
        (users: UserRepository['Service'], id: string) =>
          users.update(id, { status: 'pending_deletion' }),
      ],
    ] as const)(
      'an active account an admin moves to pending deletion through %s gets a purge date',
      async (_, move) => {
        const id = await account()
        const before = Date.now()

        await withUsers((users) => move(users, id))

        const [purgeDate] = await purgeDateOf(id)
        expect(purgeDate?.getTime()).toBeGreaterThanOrEqual(before - 1000)
      }
    )
  }
)
