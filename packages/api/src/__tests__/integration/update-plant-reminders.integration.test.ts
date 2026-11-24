import {
  CareOnPostgresLive,
  drainOutbox,
} from '@lily/api/__tests__/integration/care-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { permitTo } from '@lily/api/__tests__/mocks/care'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CareReadsLive } from '@lily/api/contexts/care'
import {
  Dirty,
  ReminderStoreLive,
  Reminders,
} from '@lily/api/contexts/reminders'
import { transact } from '@lily/api/kernel/transact'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { NotificationDeliveryLive } from '@lily/api/repositories/notification-delivery.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { StoredRefRepositoryLive } from '@lily/api/repositories/stored-ref.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { PlantUpdateRequest } from '@lily/shared/plant'
import { asc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer, References, Schema } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY_MS = 24 * 60 * 60 * 1000

const AppLive = CareOnPostgresLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      Layer.mergeAll(
        PlantRepositoryLive,
        StoredRefRepositoryLive,
        CareScheduleRepositoryLive,
        CareReadsLive,
        NotificationRepositoryLive,
        NotificationDeliveryLive,
        ReminderStoreLive,
        UserRepositoryLive,
        CanopyRepositoryLive,
        RoomRepositoryLive
      ).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive)),
      createMockDelegationRepository({}),
      createMockEventBus(),
      createMockWeatherProvider(),
      createMockWeatherCache(),
      createMockWeatherRepository(),
      createMockGCSService(),
      Layer.succeed(FileSystem, {} as never)
    )
  )
)

const sent = Schema.decodeUnknownSync(Schema.fromJsonString(PlantUpdateRequest))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'A plant edit turns its reminders off and on - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string
    let plantId: string

    const run = <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof AppLive>>
    ) =>
      Effect.runPromise(
        effect.pipe(
          Effect.tap(() => drainOutbox),
          Effect.provide(Layer.fresh(AppLive)),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

    const edit = (body: object) =>
      run(
        Effect.gen(function* () {
          const repo = yield* PlantRepository
          const plant = yield* Effect.fromNullishOr(
            yield* repo.findById(plantId)
          )
          return yield* updatePlant(plant, permitTo('edit', plantId, userId), {
            ...sent(JSON.stringify(body)),
            id: plantId,
          })
        })
      )

    const stored = async () => {
      const [row] = await db
        .select({ remindersEnabled: schema.plants.remindersEnabled })
        .from(schema.plants)
        .where(eq(schema.plants.id, plantId))
      return row?.remindersEnabled
    }

    const pending = () =>
      db
        .select({
          type: schema.notifications.type,
          scheduledAt: schema.notifications.scheduledAt,
        })
        .from(schema.notifications)
        .where(sql`${schema.notifications.status} = 'pending'`)
        .orderBy(asc(schema.notifications.type))

    const reminderRequests = () =>
      db
        .select({ event: schema.outbox.event })
        .from(schema.outbox)
        .where(eq(schema.outbox.topic, 'reminders'))

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      for (const table of ['outbox', 'notifications', 'plants', 'users']) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      const [user] = await db
        .insert(schema.users)
        .values({
          email: 'plant-reminders@example.com',
          name: 'Reminders',
          emailVerified: true,
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
      const upcoming = new Date(Date.now() + 3 * DAY_MS)
      const overdue = new Date(Date.now() - 2 * DAY_MS)
      await db.insert(schema.plantCareSchedules).values([
        {
          plantId,
          careType: 'watering',
          frequencyDays: 7,
          nextCareAt: upcoming,
          dueDay: careDayOf(upcoming),
        },
        {
          plantId,
          careType: 'misting',
          frequencyDays: 7,
          nextCareAt: overdue,
          dueDay: careDayOf(overdue),
        },
      ])
      await run(
        transact(Reminders.request(Dirty.Plants({ plantIds: [plantId] })))
      )
    })

    afterAll(async () => {
      await pool.end()
    })

    it('removes the waiting reminders when reminders turn off', async () => {
      expect((await pending()).map((row) => row.type)).toEqual([
        'watering_reminder',
      ])

      await edit({ remindersEnabled: false })

      expect(await stored()).toBe(false)
      expect(await pending()).toEqual([])
    })

    it('brings back the upcoming reminder only when reminders turn on again', async () => {
      const before = await pending()
      await edit({ remindersEnabled: false })
      expect(await pending()).toEqual([])

      await edit({ remindersEnabled: true })

      expect(await stored()).toBe(true)
      expect(await pending()).toEqual(before)
    })

    it('keeps reminders off through an edit that does not carry the switch', async () => {
      await edit({ remindersEnabled: false })
      await db.execute(sql.raw('TRUNCATE TABLE outbox RESTART IDENTITY'))

      await edit({ name: 'Renamed', isFavorite: true })

      expect(await stored()).toBe(false)
      expect(await reminderRequests()).toEqual([])
      expect(await pending()).toEqual([])
    })
  }
)
