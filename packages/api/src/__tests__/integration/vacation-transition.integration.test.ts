import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array as Arr, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoryLive = UserRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

const DAY_MS = 24 * 60 * 60 * 1000

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'UserRepository.transitionVacation - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string

    const truncateUsers = async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await truncateUsers()
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `vacationer-${Date.now()}@example.com`,
          name: 'Vacationer',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!row) throw new Error('Failed to create user')
      userId = row.id
    })

    afterAll(async () => {
      await truncateUsers()
      await pool.end()
    })

    const setVacationColumns = async (
      columns: Pick<
        typeof schema.users.$inferInsert,
        'vacationStatus' | 'vacationStart' | 'vacationEnd'
      >
    ) => {
      const [row] = await db
        .update(schema.users)
        .set(columns)
        .where(eq(schema.users.id, userId))
        .returning()
      if (!row) throw new Error('Failed to set vacation columns')
      return row
    }

    const currentVacation = async () => {
      const [row] = await db
        .select({
          vacationStatus: schema.users.vacationStatus,
          vacationStart: schema.users.vacationStart,
          vacationEnd: schema.users.vacationEnd,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      return row
    }

    it('does not activate a vacation that was canceled after the read', async () => {
      const snapshot = await setVacationColumns({
        vacationStatus: 'scheduled',
        vacationStart: new Date(Date.now() - DAY_MS),
        vacationEnd: new Date(Date.now() + 6 * DAY_MS),
      })

      const activated = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* UserRepository
          const canceled = yield* repo.transitionVacation(snapshot, {
            vacationStatus: 'none',
            vacationStart: null,
            vacationEnd: null,
          })
          expect(canceled?.vacationStatus).toBe('none')
          return yield* repo.transitionVacation(snapshot, {
            vacationStatus: 'active',
          })
        }).pipe(Effect.provide(RepositoryLive))
      )

      expect(activated).toBeNull()
      expect(await currentVacation()).toEqual({
        vacationStatus: 'none',
        vacationStart: null,
        vacationEnd: null,
      })
    })

    it('does not end a vacation whose end moved after the read', async () => {
      const snapshot = await setVacationColumns({
        vacationStatus: 'active',
        vacationStart: new Date(Date.now() - 7 * DAY_MS),
        vacationEnd: new Date(Date.now() - DAY_MS),
      })
      const extendedEnd = new Date(Date.now() + 5 * DAY_MS)

      const ended = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* UserRepository
          const extended = yield* repo.transitionVacation(snapshot, {
            vacationStatus: 'active',
            vacationEnd: extendedEnd,
          })
          expect(extended?.vacationEnd).toEqual(extendedEnd)
          return yield* repo.transitionVacation(snapshot, {
            vacationStatus: 'none',
            vacationStart: null,
            vacationEnd: null,
          })
        }).pipe(Effect.provide(RepositoryLive))
      )

      expect(ended).toBeNull()
      const current = await currentVacation()
      expect(current?.vacationStatus).toBe('active')
      expect(current?.vacationEnd).toEqual(extendedEnd)
    })

    it('lets exactly one of two concurrent transitions from the same snapshot win', async () => {
      const snapshot = await setVacationColumns({
        vacationStatus: 'scheduled',
        vacationStart: new Date(Date.now() - DAY_MS),
        vacationEnd: new Date(Date.now() + 6 * DAY_MS),
      })

      const results = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* UserRepository
          return yield* Effect.forEach(
            [
              {
                vacationStatus: 'none',
                vacationStart: null,
                vacationEnd: null,
              },
              { vacationStatus: 'active' },
            ] as const,
            (next) => repo.transitionVacation(snapshot, next),
            { concurrency: 'unbounded' }
          )
        }).pipe(Effect.provide(RepositoryLive))
      )

      const winners = Arr.filter(results, (r) => r !== null)
      expect(winners).toHaveLength(1)
      expect((await currentVacation())?.vacationStatus).toBe(
        winners[0]?.vacationStatus
      )
    })
  }
)
