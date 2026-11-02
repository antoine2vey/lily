import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import { processMessage } from '@lily/api/services/notification-scheduler/worker'
import { deleteAccount } from '@lily/api/services/user/endpoints/delete-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type {
  LiveActivityPushMessage,
  PushMessage,
  QueueMessage,
} from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Account pending deletion receives no pushes - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    })

    afterAll(async () => {
      await pool.end()
    })

    it('sends neither a push nor a Live Activity for a due reminder after deleteAccount', async () => {
      const stamp = Date.now()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `deleted-${stamp}@example.com`,
          name: `deleted-${stamp}`,
          emailVerified: true,
          timezone: 'UTC',
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')

      const [device] = await db
        .insert(schema.deviceTokens)
        .values({
          token: `ExponentPushToken[deleted-${stamp}]`,
          platform: 'ios',
          userId: user.id,
        })
        .returning()
      if (!device) throw new Error('device token insert returned nothing')
      await db.insert(schema.activityPushTokens).values({
        userId: user.id,
        deviceTokenId: device.id,
        kind: 'start',
        token: `la-start-${stamp}`,
      })

      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId: user.id,
          createdByUserId: user.id,
          name: 'Monstera',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      await db.insert(schema.plantCareSchedules).values({
        plantId: plant.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: new Date(stamp - 86_400_000),
      })
      const [reminder] = await db
        .insert(schema.notifications)
        .values({
          type: 'watering_reminder',
          scheduledAt: new Date(stamp - 60_000),
          userId: user.id,
          plantId: plant.id,
        })
        .returning()
      if (!reminder) throw new Error('notification insert returned nothing')

      const enqueued: QueueMessage[] = []
      const pushes: PushMessage[] = []
      const liveActivities: LiveActivityPushMessage[] = []
      const PipelineLive = Layer.mergeAll(
        RepositoriesLive,
        MockAlerterLive,
        createMockMessageQueue({
          onEnqueue: (_topic, message) => {
            enqueued.push(message)
          },
        }),
        createMockPushService({
          onSendBatch: (messages) => {
            pushes.push(...messages)
          },
          onSendLiveActivity: (message) => {
            liveActivities.push(message)
          },
        }),
        createMockCurrentUser({ id: user.id, email: user.email })
      )
      const run = <A, E>(
        effect: Effect.Effect<A, E, Layer.Success<typeof PipelineLive>>
      ) =>
        Effect.runPromise(
          effect.pipe(
            Effect.provide(PipelineLive),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )

      await run(deleteAccount())
      await run(pollAndEnqueue)
      expect(enqueued).toHaveLength(1)
      for (const message of enqueued) {
        await run(processMessage(message))
      }

      const [after] = await db
        .select({ status: schema.notifications.status })
        .from(schema.notifications)
        .where(eq(schema.notifications.id, reminder.id))
      expect(after?.status).toBe('sent')
      expect(pushes).toEqual([])
      expect(liveActivities).toEqual([])
      expect(
        await db
          .select({ id: schema.deviceTokens.id })
          .from(schema.deviceTokens)
          .where(eq(schema.deviceTokens.userId, user.id))
      ).toEqual([])
      expect(
        await db
          .select({ id: schema.activityPushTokens.id })
          .from(schema.activityPushTokens)
          .where(eq(schema.activityPushTokens.userId, user.id))
      ).toEqual([])
    })
  }
)
