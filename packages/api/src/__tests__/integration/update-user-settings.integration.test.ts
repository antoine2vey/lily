import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { UserSettingsUpdateRequest } from '@lily/shared/user'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Exit, Layer, References } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY_MS = 24 * 60 * 60 * 1000

const RebuildAlwaysFails = Layer.effect(
  NotificationRepository,
  Effect.map(NotificationRepository, (repo) => ({
    ...repo,
    replaceReminders: () =>
      Effect.fail(
        new SqlError({
          reason: new UnknownError({
            cause: new Error('injected'),
            message: 'injected rebuild failure',
          }),
        })
      ),
  }))
).pipe(Layer.provide(NotificationRepositoryLive))

const makeLayer = (notifications: typeof NotificationRepositoryLive) =>
  Layer.mergeAll(
    PlantRepositoryLive,
    UserRepositoryLive,
    CareScheduleRepositoryLive,
    CareLogRepositoryLive,
    DelegationRepositoryLive,
    CanopyRepositoryLive,
    notifications
  ).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const HealthyLive = makeLayer(NotificationRepositoryLive)
const FailingLive = makeLayer(RebuildAlwaysFails)

const localHour = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Settings changes rebuild reminders in their transaction - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string
    let plantId: string

    const resetDb = async () => {
      for (const table of [
        'notifications',
        'plant_care_schedules',
        'plants',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
    }

    const update = (
      request: UserSettingsUpdateRequest,
      layer: typeof HealthyLive = HealthyLive
    ) =>
      Effect.runPromiseExit(
        updateUserSettings(request).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId }),
              createMockRateLimiterService(),
              layer
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

    const pending = () =>
      db
        .select({
          type: schema.notifications.type,
          scheduledAt: schema.notifications.scheduledAt,
        })
        .from(schema.notifications)
        .where(sql`${schema.notifications.status} = 'pending'`)
        .orderBy(schema.notifications.type)

    const storedTimezone = async () => {
      const [row] = await db
        .select({ timezone: schema.users.timezone })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      return row?.timezone
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await resetDb()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `settings-${Date.now()}@example.com`,
          name: 'Settings',
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
          careReminders: true,
          preferredNotificationTime: '09:00',
        })
        .returning()
      if (!user) throw new Error('Failed to create user')
      userId = user.id
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId,
          createdByUserId: userId,
          name: 'Fern',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('Failed to create plant')
      plantId = plant.id
      await db.insert(schema.plantCareSchedules).values(
        (['watering', 'misting', 'repotting'] as const).map((careType) => ({
          plantId,
          careType,
          frequencyDays: 7,
          nextCareAt: new Date(Date.now() + 3 * DAY_MS),
        }))
      )
      await Effect.runPromise(
        rescheduleReminders([plantId]).pipe(Effect.provide(HealthyLive))
      )
    })

    afterAll(async () => {
      await resetDb()
      await pool.end()
    })

    it('keeps the old timezone and reminders when the rebuild fails', async () => {
      const before = await pending()

      const exit = await update({ timezone: 'America/New_York' }, FailingLive)

      expect(Exit.isFailure(exit)).toBe(true)
      expect(await storedTimezone()).toBe('UTC')
      expect(await pending()).toEqual(before)
    })

    it('moves every reminder to the new timezone outside do-not-disturb', async () => {
      await db
        .update(schema.users)
        .set({
          doNotDisturb: true,
          doNotDisturbStart: '08:00',
          doNotDisturbEnd: '10:00',
        })
        .where(eq(schema.users.id, userId))

      const exit = await update({ timezone: 'America/New_York' })

      expect(Exit.isSuccess(exit)).toBe(true)
      const rows = await pending()
      expect(rows.map((row) => row.type)).toEqual([
        'watering_reminder',
        'misting_reminder',
        'repotting_reminder',
      ])
      expect(
        rows.map((row) => localHour(row.scheduledAt, 'America/New_York'))
      ).toEqual(['10', '10', '10'])
    })

    it('brings misting and repotting reminders back when care reminders turn on', async () => {
      expect(
        Exit.isSuccess(
          await update({ notifications: { careReminders: false } })
        )
      ).toBe(true)
      expect(await pending()).toEqual([])

      expect(
        Exit.isSuccess(await update({ notifications: { careReminders: true } }))
      ).toBe(true)

      expect((await pending()).map((row) => row.type)).toEqual([
        'watering_reminder',
        'misting_reminder',
        'repotting_reminder',
      ])
    })
  }
)
