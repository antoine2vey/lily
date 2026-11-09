import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import {
  DelegationRepository,
  DelegationRepositoryLive,
} from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { RecipientRepositoryLive } from '@lily/api/repositories/recipient.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { rebuildDelegationReminders } from '@lily/api/services/delegation/helpers/transition-delegation'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array as Arr, Deferred, Effect, Layer } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
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

const VacationServicesLive = Layer.mergeAll(
  PlantRepositoryLive,
  UserRepositoryLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive,
  CanopyRepositoryLive,
  RecipientRepositoryLive,
  NotificationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Ending a vacation rebuilds every reminder the user hears - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const names = new Map<string, string>()

    const user = async (
      name: string,
      vacation: Pick<
        typeof schema.users.$inferInsert,
        'vacationStatus' | 'vacationStart' | 'vacationEnd'
      >
    ) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${Date.now()}@example.com`,
          name,
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
          careReminders: true,
          preferredNotificationTime: '09:00',
          ...vacation,
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      names.set(row.id, name)
      return row
    }

    const plant = async (name: string, userId: string) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          userId,
          createdByUserId: userId,
          name,
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      names.set(row.id, name)
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: new Date(Date.now() + 3 * DAY_MS),
      })
      return row.id
    }

    const resetDb = async () => {
      for (const table of [
        'notifications',
        'care_delegations',
        'plant_care_schedules',
        'plants',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      await resetDb()
    })

    afterAll(async () => {
      await resetDb()
      await pool.end()
    })

    it('gives a caretaker back the reminders of the plants they care for', async () => {
      const owner = await user('owner', { vacationStatus: 'none' })
      const ann = await user('ann', {
        vacationStatus: 'active',
        vacationStart: new Date(Date.now() - 2 * DAY_MS),
        vacationEnd: new Date(Date.now() + 2 * DAY_MS),
      })
      const fern = await plant('fern', owner.id)
      await plant('moss', ann.id)
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId: owner.id,
          caretakerId: ann.id,
          status: 'active',
          startDate: new Date(Date.now() - 3 * DAY_MS),
          endDate: new Date(Date.now() + 30 * DAY_MS),
        })
        .returning()
      if (!delegation) throw new Error('Failed to create delegation')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId: fern })

      await Effect.runPromise(
        endVacation({ user: ann, effectiveEnd: new Date() }).pipe(
          Effect.provide(VacationServicesLive)
        )
      )

      const rows = await db
        .select({
          userId: schema.notifications.userId,
          plantId: schema.notifications.plantId,
        })
        .from(schema.notifications)
        .where(sql`${schema.notifications.status} = 'pending'`)
      expect(
        Arr.sort(
          Arr.map(
            rows,
            (row) =>
              `${names.get(row.plantId ?? '')} -> ${names.get(row.userId)}`
          ),
          (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
        )
      ).toEqual(['fern -> ann', 'moss -> ann'])
    })

    const waitForLockWaiter = async (done: Promise<unknown>) => {
      for (const _ of Arr.range(1, 40)) {
        const { rows } = await pool.query<{ waiting: number }>(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'`
        )
        if ((rows[0]?.waiting ?? 0) > 0) return
        const finished = await Promise.race([
          done.then(() => true),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), 50)
          ),
        ])
        if (finished) return
      }
    }

    it('gives a caretaker the reminders of a delegation that starts while the vacation ends', async () => {
      const owner = await user('owner2', { vacationStatus: 'none' })
      const bea = await user('bea', {
        vacationStatus: 'active',
        vacationStart: new Date(Date.now() - 2 * DAY_MS),
        vacationEnd: new Date(Date.now() + 2 * DAY_MS),
      })
      const ivy = await plant('ivy', owner.id)
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId: owner.id,
          caretakerId: bea.id,
          status: 'pending',
          startDate: new Date(Date.now() - DAY_MS),
          endDate: new Date(Date.now() + 30 * DAY_MS),
        })
        .returning()
      if (!delegation) throw new Error('Failed to create delegation')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId: ivy })

      const readPlants = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()
      const pausedAfterReadingPlants = Layer.effect(
        PlantRepository,
        Effect.map(PlantRepository, (repo) => ({
          ...repo,
          findPersonalReminderPlantIds: (userId: string) =>
            repo.findPersonalReminderPlantIds(userId).pipe(
              Effect.tap(() => Deferred.succeed(readPlants, undefined)),
              Effect.tap(() => Deferred.await(release))
            ),
        }))
      )

      const ending = Effect.runPromise(
        endVacation({ user: bea, effectiveEnd: new Date() }).pipe(
          Effect.provide(
            Layer.provideMerge(pausedAfterReadingPlants, VacationServicesLive)
          )
        )
      )
      await Effect.runPromise(Deferred.await(readPlants))
      const activating = Effect.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const repo = yield* DelegationRepository
          yield* sql.withTransaction(
            Effect.gen(function* () {
              const row = yield* repo.transitionStatus(
                delegation.id,
                ['pending'],
                'active'
              )
              if (row) yield* rebuildDelegationReminders([row])
            })
          )
        }).pipe(Effect.provide(VacationServicesLive))
      )
      await waitForLockWaiter(activating)
      await Effect.runPromise(Deferred.succeed(release, undefined))
      await Promise.all([ending, activating])

      const rows = await db
        .select({ userId: schema.notifications.userId })
        .from(schema.notifications)
        .where(
          sql`${schema.notifications.status} = 'pending' AND ${schema.notifications.plantId} = ${ivy}`
        )
      expect(Arr.map(rows, (row) => names.get(row.userId))).toEqual(['bea'])
    })
  }
)
