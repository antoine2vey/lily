import { delivered, settled } from '@lily/api/__tests__/integration/care-layers'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CareReadsLive } from '@lily/api/contexts/care'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { activateVacation } from '@lily/api/services/vacation/helpers/activate-vacation'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Exit, Layer } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY_MS = 24 * 60 * 60 * 1000

const injectedFailure = new SqlError({
  reason: new UnknownError({
    cause: new Error('injected'),
    message: 'injected sweep failure',
  }),
})

const SweepAlwaysFails = Layer.effect(
  NotificationRepository,
  Effect.map(NotificationRepository, (repo) => ({
    ...repo,
    deletePendingByUserIdAndTypes: () => Effect.fail(injectedFailure),
  }))
).pipe(Layer.provide(NotificationRepositoryLive))

const makeLayer = (notifications: typeof NotificationRepositoryLive) =>
  Layer.mergeAll(
    PlantRepositoryLive,
    UserRepositoryLive,
    CareScheduleRepositoryLive,
    CareReadsLive,
    DelegationRepositoryLive,
    CanopyRepositoryLive,
    notifications,
    createMockEventBus(),
    createMockWeatherProvider(),
    createMockWeatherCache(),
    createMockWeatherRepository()
  ).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const FailingLive = makeLayer(SweepAlwaysFails)
const HealthyLive = makeLayer(NotificationRepositoryLive)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Vacation transitions roll back with their side effects - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>

    const resetDb = async () => {
      await db.execute(sql`TRUNCATE TABLE outbox RESTART IDENTITY`)
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE plant_care_schedules RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE plants RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(resetDb)

    afterAll(async () => {
      await resetDb()
      await pool.end()
    })

    const insertUser = async (
      vacation: Pick<
        typeof schema.users.$inferInsert,
        'vacationStatus' | 'vacationStart' | 'vacationEnd'
      >
    ) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `vacationer-${Date.now()}@example.com`,
          name: 'Vacationer',
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
          careReminders: true,
          preferredNotificationTime: '09:00',
          ...vacation,
        })
        .returning()
      if (!row) throw new Error('Failed to create user')
      return row
    }

    const currentUser = async (userId: string) => {
      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      return row
    }

    it('rolls the activation claim and its reminder request back when the pending-row delete fails, and the rerun completes it', async () => {
      const user = await insertUser({
        vacationStatus: 'scheduled',
        vacationStart: new Date(Date.now() - DAY_MS),
        vacationEnd: new Date(Date.now() + 6 * DAY_MS),
      })

      const failed = await Effect.runPromiseExit(
        settled(activateVacation({ expected: user })).pipe(
          Effect.provide(FailingLive)
        )
      )
      expect(Exit.isFailure(failed)).toBe(true)
      expect((await currentUser(user.id))?.vacationStatus).toBe('scheduled')
      expect(await db.select().from(schema.outbox)).toEqual([])

      const rerun = await Effect.runPromise(
        settled(activateVacation({ expected: user })).pipe(
          Effect.provide(HealthyLive)
        )
      )
      expect(rerun?.vacationStatus).toBe('active')
      expect((await currentUser(user.id))?.vacationStatus).toBe('active')
    })

    it('rolls the end claim, the schedule shift, its event and the reminder request back when the sweep fails, and the rerun completes them', async () => {
      const user = await insertUser({
        vacationStatus: 'active',
        vacationStart: new Date(Date.now() - 7 * DAY_MS),
        vacationEnd: new Date(Date.now() - DAY_MS),
      })
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId: user.id,
          name: 'Fern',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('Failed to create plant')
      const dueMidVacation = new Date(Date.now() - 3 * DAY_MS)
      await db.insert(schema.plantCareSchedules).values({
        plantId: plant.id,
        careType: 'watering',
        frequencyDays: 3,
        nextCareAt: dueMidVacation,
      })
      const nextCareAt = async () => {
        const [row] = await db
          .select({ nextCareAt: schema.plantCareSchedules.nextCareAt })
          .from(schema.plantCareSchedules)
          .where(eq(schema.plantCareSchedules.plantId, plant.id))
        return row?.nextCareAt
      }
      const appended = () =>
        db
          .select({ topic: schema.outbox.topic, event: schema.outbox.event })
          .from(schema.outbox)
          .orderBy(schema.outbox.id)
      const pendingReminders = () =>
        db
          .select({
            userId: schema.notifications.userId,
            type: schema.notifications.type,
          })
          .from(schema.notifications)
          .where(eq(schema.notifications.plantId, plant.id))
      const effectiveEnd = user.vacationEnd ?? new Date()

      const failed = await Effect.runPromiseExit(
        delivered(endVacation({ user, effectiveEnd })).pipe(
          Effect.provide(FailingLive)
        )
      )
      expect(Exit.isFailure(failed)).toBe(true)
      const afterFailure = await currentUser(user.id)
      expect(afterFailure?.vacationStatus).toBe('active')
      expect(afterFailure?.vacationEnd).toEqual(user.vacationEnd)
      expect(await nextCareAt()).toEqual(dueMidVacation)
      expect(await appended()).toEqual([])

      const rerun = await Effect.runPromise(
        delivered(endVacation({ user, effectiveEnd })).pipe(
          Effect.provide(HealthyLive)
        )
      )
      expect(rerun?.vacationStatus).toBe('none')
      const afterRerun = await currentUser(user.id)
      expect(afterRerun?.vacationStatus).toBe('none')
      expect(afterRerun?.vacationEnd).toBeNull()
      expect((await nextCareAt())?.getTime()).toBeGreaterThan(Date.now())
      expect(await appended()).toMatchObject([
        {
          topic: 'care',
          event: {
            _tag: 'ScheduleChanged',
            plantId: plant.id,
            careType: 'watering',
            reason: 'vacation',
          },
        },
        { topic: 'reminders', event: { _tag: 'Recipient', userId: user.id } },
      ])
      expect(await pendingReminders()).toEqual([
        { userId: user.id, type: 'watering_reminder' },
      ])
    })
  }
)
