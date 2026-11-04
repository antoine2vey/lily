import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockAlerter } from '@lily/api/__tests__/mocks/alerter'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDeadLetterRepository } from '@lily/api/__tests__/mocks/dead-letter.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createSuccessPushService } from '@lily/api/__tests__/mocks/push.service'
import { createInMemoryRedisQueue } from '@lily/api/__tests__/mocks/redis-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { createDelegation } from '@lily/api/services/delegation/endpoints/create-delegation'
import {
  dispatchNow,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import {
  consumeFromTopic,
  recoverStrandedDeliveries,
} from '@lily/api/services/notification-scheduler/worker'
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
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
} from 'vitest'

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

    const deliverPending = async () => {
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
              createMockDeadLetterRepository(),
              createMockCanopyRepository([])
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )
      return enqueued
    }

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

      const enqueued = await deliverPending()

      expect(enqueued).toHaveLength(1)
      expect(await notificationRows()).toEqual([
        { status: 'sent', type: 'new_follower' },
      ])
    })

    it('delivers a committed notification left queued once the recovery sweep releases it', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const sqlClient = yield* SqlClient.SqlClient
          yield* sqlClient.withTransaction(recordFollowFor(userId))
        }).pipe(Effect.provide(DatabaseLive))
      )
      await db.execute(
        sql`UPDATE notifications SET queued_at = now() - interval '11 minutes' WHERE user_id = ${userId}`
      )

      expect(await deliverPending()).toEqual([])
      expect(await notificationRows()).toEqual([
        { status: 'queued', type: 'new_follower' },
      ])

      await Effect.runPromise(
        recoverStrandedDeliveries.pipe(
          Effect.provide(
            Layer.mergeAll(DatabaseLive, createMockMessageQueue())
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(await deliverPending()).toHaveLength(1)
      expect(await notificationRows()).toEqual([
        { status: 'sent', type: 'new_follower' },
      ])
    })

    it('rolls a new delegation back when its notification insert fails', async () => {
      const [caretaker] = await db
        .insert(schema.users)
        .values({
          email: `caretaker-${Date.now()}@example.com`,
          name: 'caretaker',
          emailVerified: true,
        })
        .returning({ id: schema.users.id })
      const [plant] = await db
        .insert(schema.plants)
        .values({
          name: 'Monstera',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          userId,
        })
        .returning({ id: schema.plants.id })
      if (!caretaker || !plant) throw new Error('Failed to seed delegation')
      await db.execute(
        sql.raw(`
          CREATE FUNCTION refuse_notification_for() RETURNS trigger AS $$
          BEGIN
            IF NEW.user_id::text = TG_ARGV[0] THEN
              RAISE EXCEPTION 'notification refused';
            END IF;
            RETURN NEW;
          END $$ LANGUAGE plpgsql;
          CREATE TRIGGER refuse_notification BEFORE INSERT ON notifications
            FOR EACH ROW EXECUTE FUNCTION refuse_notification_for('${caretaker.id}');
        `)
      )
      onTestFinished(async () => {
        await db.execute(
          sql.raw(`
            DROP TRIGGER refuse_notification ON notifications;
            DROP FUNCTION refuse_notification_for();
          `)
        )
      })

      const exit = await Effect.runPromiseExit(
        createDelegation({
          caretakerId: caretaker.id,
          plantIds: [plant.id],
          startDate: new Date(Date.now() + 86_400_000).toISOString(),
          endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseLive,
              DelegationRepositoryLive.pipe(Layer.provide(DatabaseLive)),
              CanopyRepositoryLive.pipe(Layer.provide(DatabaseLive)),
              createMockLimitChecker(),
              createMockCurrentUser({ id: userId, name: 'outbox_user' }),
              createMockMessageQueue()
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(await db.select().from(schema.careDelegations)).toEqual([])
      expect(await db.select().from(schema.notifications)).toEqual([])
    })
  }
)
