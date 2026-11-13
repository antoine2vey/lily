import {
  CareOnPostgresLive,
  drainOutbox,
} from '@lily/api/__tests__/integration/care-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/auth'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CareReadsLive } from '@lily/api/contexts/care'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { processEvent } from '@lily/api/services/live-activity/subscriber'
import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  type AppEvent,
  EventBus,
  type LiveActivityPushMessage,
} from '@lily/shared/server'
import { count, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Order,
  pipe,
  Queue,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  NotificationRepositoryLive,
  UserRepositoryLive,
  DelegationRepositoryLive,
  CanopyRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

interface Published {
  readonly event: AppEvent
  readonly committedLogs: number
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'careMultiplePlants - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const laPushes: LiveActivityPushMessage[] = []
    // The Live Activity subscriber runs on its own pool, outside the care
    // transaction, as it does in the API process.
    const subscriber = ManagedRuntime.make(
      Layer.mergeAll(
        RepositoriesLive,
        ActivityPushTokenRepositoryLive.pipe(
          Layer.provide(DrizzleLive),
          Layer.provide(PgLive)
        ),
        createMockPushService({
          onSendLiveActivity: (message) => laPushes.push(message),
        })
      )
    )

    const truncate = async () => {
      await db.execute(sql`TRUNCATE TABLE outbox RESTART IDENTITY`)
      await db.execute(sql`TRUNCATE TABLE care_logs RESTART IDENTITY CASCADE`)
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

    beforeEach(async () => {
      laPushes.length = 0
      await truncate()
    })

    afterAll(async () => {
      await truncate()
      await subscriber.dispose()
      await pool.end()
    })

    const committedLogs = async (plantIds: ReadonlyArray<string>) => {
      const [row] = await db
        .select({ count: count() })
        .from(schema.careLogs)
        .where(inArray(schema.careLogs.plantId, [...plantIds]))
      return row?.count ?? 0
    }

    // A user with an active Live Activity and two plants whose watering is
    // due, each with a pending overdue reminder.
    const seed = async () => {
      const stamp = `${Date.now()}-${Math.random()}`
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `bulk-care-${stamp}@example.com`,
          name: 'Bulk Care User',
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
        })
        .returning()
      if (!user) throw new Error('Failed to create test user')
      const [device] = await db
        .insert(schema.deviceTokens)
        .values({
          token: `ExponentPushToken[bulk-${stamp}]`,
          platform: 'ios',
          userId: user.id,
        })
        .returning()
      if (!device) throw new Error('Failed to create device token')
      await db.insert(schema.activityPushTokens).values({
        userId: user.id,
        deviceTokenId: device.id,
        kind: 'update',
        activityId: `bulk-activity-${stamp}`,
        token: `la-update-${stamp}`,
      })
      const plants = await db
        .insert(schema.plants)
        .values(
          Arr.map(['Bulk Fern', 'Bulk Ivy'], (name) => ({
            userId: user.id,
            name,
            health: 'HEALTHY' as const,
            humidityRating: 3,
            lightingRating: 3,
            petToxicityRating: 1,
            wateringRating: 3,
          }))
        )
        .returning()
      const plantIds = Arr.map(plants, (p) => p.id)
      const lastCareAt = new Date(Date.now() - 10 * 86_400_000)
      const nextCareAt = new Date(Date.now() - 3 * 86_400_000)
      await db.insert(schema.plantCareSchedules).values(
        Arr.map(plantIds, (plantId) => ({
          plantId,
          careType: 'watering' as const,
          frequencyDays: 7,
          lastCareAt,
          nextCareAt,
          dueDay: careDayOf(nextCareAt),
        }))
      )
      await db.insert(schema.notifications).values(
        Arr.map(plantIds, (plantId) => ({
          userId: user.id,
          plantId,
          type: 'overdue_reminder' as const,
          title: 'Overdue',
          body: 'Water me',
          scheduledAt: nextCareAt,
        }))
      )
      return {
        user: { id: user.id, name: 'Bulk Care User', email: user.email },
        plantIds,
        nextCareAt,
      }
    }

    const careAll = (
      user: { id: string; name: string; email: string },
      plantIds: ReadonlyArray<string>,
      published: Published[]
    ) =>
      careMultiplePlants({
        plantIds: [...plantIds],
        careType: 'watering',
      }).pipe(
        Effect.exit,
        Effect.tap(() => drainOutbox),
        Effect.provide(
          CareOnPostgresLive.pipe(
            Layer.provideMerge(
              Layer.mergeAll(
                RepositoriesLive,
                createMockWeatherProvider(),
                createMockWeatherCache(),
                createMockWeatherRepository(),
                Layer.succeed(EventBus, {
                  publish: (event) =>
                    Effect.promise(async () => {
                      published.push({
                        event,
                        committedLogs: await committedLogs(plantIds),
                      })
                      await subscriber.runPromise(processEvent(event))
                    }),
                  subscribe: Queue.unbounded<AppEvent>(),
                }),
                createMockCurrentUser({
                  ...user,
                  firstName: null,
                  lastName: null,
                  username: user.name,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  role: 'user',
                  status: 'active',
                })
              )
            )
          )
        )
      )

    it('publishes nothing and sends no Live Activity push when the transaction rolls back', async () => {
      const { user, plantIds, nextCareAt } = await seed()
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fail_bulk_schedule_write() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'schedule write failed'; END;
        $$ LANGUAGE plpgsql
      `)
      await db.execute(sql`
        CREATE TRIGGER fail_bulk_schedule_write BEFORE UPDATE ON plant_care_schedules
        FOR EACH ROW EXECUTE FUNCTION fail_bulk_schedule_write()
      `)

      const published: Published[] = []
      const outcome = await Effect.runPromise(
        careAll(user, plantIds, published)
      ).finally(() =>
        db.execute(
          sql`DROP TRIGGER fail_bulk_schedule_write ON plant_care_schedules`
        )
      )

      expect(Exit.isFailure(outcome)).toBe(true)
      expect(published).toEqual([])
      expect(laPushes).toEqual([])
      expect(await committedLogs(plantIds)).toBe(0)
      const schedules = await db
        .select({ nextCareAt: schema.plantCareSchedules.nextCareAt })
        .from(schema.plantCareSchedules)
        .where(inArray(schema.plantCareSchedules.plantId, plantIds))
      expect(schedules).toEqual([{ nextCareAt }, { nextCareAt }])
      const [overdue] = await db
        .select({ count: count() })
        .from(schema.notifications)
        .where(inArray(schema.notifications.plantId, plantIds))
      expect(overdue?.count).toBe(2)
    })

    it('publishes one CareLogCreated per plant after the commit', async () => {
      const { user, plantIds } = await seed()

      const published: Published[] = []
      const outcome = await Effect.runPromise(
        careAll(user, plantIds, published)
      )

      expect(Exit.isSuccess(outcome)).toBe(true)
      expect(
        pipe(
          published,
          Arr.map(({ event, committedLogs }) => ({
            tag: event._tag,
            plantId: 'plantId' in event ? String(event.plantId) : '',
            committedLogs,
          })),
          Arr.sortBy(Order.mapInput(Order.String, (e) => e.plantId))
        )
      ).toEqual(
        Arr.flatMap(Arr.sort(plantIds, Order.String), (plantId) => [
          { tag: 'CareLogCreated', plantId, committedLogs: 2 },
          { tag: 'AttentionResponded', plantId, committedLogs: 2 },
        ])
      )
      // Both schedules moved past today before the subscriber ran, so the
      // first event ends the activity and the second finds none to update.
      expect(Arr.map(laPushes, (m) => m._tag)).toEqual(['LiveActivityEnd'])
    })
  }
)
