import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockAlerter } from '@lily/api/__tests__/mocks/alerter'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createSuccessPushService } from '@lily/api/__tests__/mocks/push.service'
import { createInMemoryRedisQueue } from '@lily/api/__tests__/mocks/redis-queue'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import {
  dispatchNow,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import { consumeFromTopic } from '@lily/api/services/notification-scheduler/worker'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  MessageQueue,
  QueueConnectionError,
  type QueueMessage,
} from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Data, Effect, Exit, Layer, References } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

class BusinessWriteFailed extends Data.TaggedError('BusinessWriteFailed') {}

const DatabaseLive = Layer.mergeAll(
  NotificationRepositoryLive,
  UserRepositoryLive,
  PlantRepositoryLive,
  DeviceTokenRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Notifications recorded in the caller transaction - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string

    const recordFollowFor = (recipient: string) =>
      recordNotification(
        'new_follower',
        recipient,
        { senderName: 'Ada' },
        'en',
        { senderId: 'ada' }
      )

    const notificationRows = () =>
      db
        .select({
          status: schema.notifications.status,
          type: schema.notifications.type,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userId))

    const resetDb = async () => {
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.execute(
        sql`TRUNCATE TABLE device_tokens RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    }

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await resetDb()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `outbox-${Date.now()}@example.com`,
          name: 'outbox_user',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning({ id: schema.users.id })
      if (!user) throw new Error('Failed to create test user')
      userId = user.id
      await db
        .insert(schema.deviceTokens)
        .values({ token: 'expo-outbox-token', platform: 'ios', userId })
    })

    afterAll(async () => {
      await resetDb()
      await pool.end()
    })

    it('leaves no notification when the transaction fails after recording it', async () => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const sqlClient = yield* SqlClient.SqlClient
          return yield* sqlClient.withTransaction(
            recordFollowFor(userId).pipe(
              Effect.andThen(Effect.fail(new BusinessWriteFailed()))
            )
          )
        }).pipe(Effect.provide(DatabaseLive))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(await notificationRows()).toEqual([])
    })

    it('delivers a committed notification once the queue comes back', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const sqlClient = yield* SqlClient.SqlClient
          const notification = yield* sqlClient.withTransaction(
            recordFollowFor(userId)
          )
          yield* dispatchNow(notification)
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseLive,
              createMockMessageQueue({
                enqueueFailure: new QueueConnectionError({
                  message: 'redis down',
                }),
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(await notificationRows()).toEqual([
        { status: 'pending', type: 'new_follower' },
      ])

      const enqueued: QueueMessage[] = []
      await Effect.runPromise(
        pollAndEnqueue.pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseLive,
              createMockMessageQueue({
                onEnqueue: (_, message) => enqueued.push(message),
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      const { queue } = createInMemoryRedisQueue(
        enqueued.map((message) => JSON.stringify(message))
      )
      await Effect.runPromise(
        consumeFromTopic('new_follower').pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseLive,
              Layer.succeed(MessageQueue, queue),
              createMockAlerter().layer,
              createSuccessPushService(),
              createMockActivityPushTokenRepository(),
              createMockCareScheduleRepository(),
              createMockCareLogRepository([]),
              createMockDelegationRepository(),
              createMockCanopyRepository([])
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(enqueued).toHaveLength(1)
      expect(await notificationRows()).toEqual([
        { status: 'sent', type: 'new_follower' },
      ])
    })
  }
)
