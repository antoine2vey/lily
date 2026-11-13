import { settled } from '@lily/api/__tests__/integration/care-layers'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import { transact } from '@lily/api/kernel/transact'
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
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { UserSettingsUpdateRequest } from '@lily/shared/user'
import { asc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Exit, Layer, References } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY_MS = 24 * 60 * 60 * 1000

const injected = (message: string) =>
  Effect.fail(
    new SqlError({
      reason: new UnknownError({ cause: new Error('injected'), message }),
    })
  )

const RemindersCannotBePlanned = Layer.effect(
  NotificationRepository,
  Effect.map(NotificationRepository, (repo) => ({
    ...repo,
    lockReminders: () => injected('injected replan failure'),
  }))
).pipe(Layer.provide(NotificationRepositoryLive))

const EngagementDeleteFails = Layer.effect(
  NotificationRepository,
  Effect.map(NotificationRepository, (repo) => ({
    ...repo,
    deletePendingByUserIdAndTypes: (userId, types) =>
      Array.contains(types, 'daily_tip')
        ? injected('injected engagement delete failure')
        : repo.deletePendingByUserIdAndTypes(userId, types),
  }))
).pipe(Layer.provide(NotificationRepositoryLive))

const makeLayer = (notifications: typeof NotificationRepositoryLive) =>
  Layer.mergeAll(
    PlantRepositoryLive,
    UserRepositoryLive,
    CareScheduleRepositoryLive,
    CareReadsLive,
    CareLogRepositoryLive,
    DelegationRepositoryLive,
    CanopyRepositoryLive,
    notifications,
    createMockEventBus()
  ).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const HealthyLive = makeLayer(NotificationRepositoryLive)
const UnplannableLive = makeLayer(RemindersCannotBePlanned)
const EngagementFailingLive = makeLayer(EngagementDeleteFails)

const localHour = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Settings changes ask for their reminders to be planned again - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string
    let plantId: string

    const resetDb = async () => {
      for (const table of [
        'outbox',
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
        settled(updateUserSettings(request)).pipe(
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

    const requests = () =>
      db
        .select({
          event: schema.outbox.event,
          pendingConsumers: schema.outbox.pendingConsumers,
          processed: sql<boolean>`${schema.outbox.processedAt} is not null`,
        })
        .from(schema.outbox)
        .orderBy(asc(schema.outbox.id))

    const retryNow = () =>
      db.execute(
        sql`UPDATE outbox SET available_at = to_timestamp(0), claimed_until = NULL`
      )

    const storedTimezone = async () => {
      const [row] = await db
        .select({ timezone: schema.users.timezone })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      return row?.timezone
    }

    const storedSwitches = async () => {
      const [row] = await db
        .select({
          careReminders: schema.users.careReminders,
          tips: schema.users.tips,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      return row
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
        settled(
          transact(Reminders.request(Dirty.Plants({ plantIds: [plantId] })))
        ).pipe(Effect.provide(HealthyLive))
      )
      await db.execute(sql`TRUNCATE TABLE outbox RESTART IDENTITY`)
    })

    afterAll(async () => {
      await resetDb()
      await pool.end()
    })

    it('stores the new timezone when the reminders cannot be planned, and moves them on a later drain', async () => {
      const before = await pending()
      const request = { _tag: 'Recipient', userId }

      const exit = await update(
        { timezone: 'America/New_York' },
        UnplannableLive
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await storedTimezone()).toBe('America/New_York')
      expect(await pending()).toEqual(before)
      expect(await requests()).toEqual([
        {
          event: request,
          pendingConsumers: ['reminders-replan'],
          processed: false,
        },
      ])

      await retryNow()
      await Effect.runPromise(
        settled(Effect.void).pipe(Effect.provide(HealthyLive))
      )

      expect(
        (await pending()).map((row) =>
          localHour(row.scheduledAt, 'America/New_York')
        )
      ).toEqual(['09', '09', '09'])
      expect(await requests()).toEqual([
        { event: request, pendingConsumers: [], processed: true },
      ])
    })

    it('keeps both switches, every pending row and asks for nothing when the tips delete fails', async () => {
      await db.insert(schema.notifications).values(
        (['daily_tip', 'inactivity_nudge'] as const).map((type) => ({
          userId,
          type,
          scheduledAt: new Date(Date.now() + DAY_MS),
          status: 'pending' as const,
          title: 'Tip',
          body: 'Tip',
        }))
      )
      const before = await pending()
      expect(before.map((row) => row.type)).toEqual([
        'watering_reminder',
        'misting_reminder',
        'repotting_reminder',
        'daily_tip',
        'inactivity_nudge',
      ])

      const exit = await update(
        { notifications: { careReminders: false, tips: false } },
        EngagementFailingLive
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(await storedSwitches()).toEqual({
        careReminders: true,
        tips: true,
      })
      expect(await pending()).toEqual(before)
      expect(await requests()).toEqual([])
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
