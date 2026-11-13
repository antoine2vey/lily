import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockAlerter } from '@lily/api/__tests__/mocks/alerter'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockDeadLetterRepository } from '@lily/api/__tests__/mocks/dead-letter.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import {
  createFailingPushService,
  createMockPushService,
  createSuccessPushService,
} from '@lily/api/__tests__/mocks/push.service'
import {
  createInMemoryRedis,
  createInMemoryRedisQueue,
} from '@lily/api/__tests__/mocks/redis-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import {
  FollowRepository,
  FollowRepositoryLive,
} from '@lily/api/repositories/follow.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { Alerter } from '@lily/api/services/alerting'
import {
  type AlertEvent,
  makeAlerter,
} from '@lily/api/services/alerting/service'
import { createDelegation } from '@lily/api/services/delegation/endpoints/create-delegation'
import {
  dispatchNow,
  recordNotification,
  recordNotificationAt,
} from '@lily/api/services/helpers/schedule-notification'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import {
  consumeNext,
  recoverStrandedDeliveries,
} from '@lily/api/services/notification-scheduler/worker'
import { followUser } from '@lily/api/services/social/endpoints/follow-user'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  MessageQueue,
  QueueConnectionError,
  type QueueMessage,
} from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Data, Duration, Effect, Exit, Layer, Logger, References } from 'effect'
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
  DeviceTokenRepositoryLive,
  CanopyRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive
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

    const enqueuePending = async () => {
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
      return enqueued
    }

    const deliverPending = async (push = createSuccessPushService()) => {
      const enqueued = await enqueuePending()
      const { queue } = createInMemoryRedisQueue(
        enqueued.map((message) => JSON.stringify(message))
      )
      await Effect.runPromise(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseLive,
              Layer.succeed(MessageQueue, queue),
              createMockAlerter().layer,
              push,
              createMockActivityPushTokenRepository(),
              createMockCareLogRepository([]),
              createMockDeadLetterRepository()
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )
      return enqueued
    }

    const consumeWhilePushIsDown = async (
      message: QueueMessage,
      alerter: {
        readonly layer: Layer.Layer<Alerter>
        readonly events: ReadonlyArray<unknown>
      } = createMockAlerter()
    ) => {
      const { queue, acked } = createInMemoryRedisQueue([
        JSON.stringify(message),
      ])
      const warnings: unknown[] = []
      const captureWarnings = Logger.make(({ logLevel, message: logged }) => {
        if (logLevel === 'Warn') warnings.push(logged)
      })
      const exit = await Effect.runPromiseExit(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseLive,
              DeadLetterRepositoryLive.pipe(Layer.provide(DatabaseLive)),
              Layer.succeed(MessageQueue, queue),
              alerter.layer,
              createFailingPushService('push down'),
              createMockActivityPushTokenRepository(),
              createMockCareLogRepository([]),
              Logger.layer([captureWarnings])
            )
          )
        )
      )
      return {
        exit,
        acked,
        alerts: alerter.events,
        warnings: JSON.stringify(warnings),
      }
    }

    const attemptRows = () =>
      db
        .select({
          status: schema.notifications.status,
          retryCount: schema.notifications.retryCount,
          deliveryMessageId: schema.notifications.deliveryMessageId,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userId))

    const deadLettersFor = (message: QueueMessage) =>
      db
        .select({
          originalMessageId: schema.deadLetterMessages.originalMessageId,
        })
        .from(schema.deadLetterMessages)
        .where(eq(schema.deadLetterMessages.originalMessageId, message.id))

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

    it('rolls the third failure back and alerts once while its dead letter cannot be written, so a later redelivery fails it', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const sqlClient = yield* SqlClient.SqlClient
          yield* sqlClient.withTransaction(recordFollowFor(userId))
        }).pipe(Effect.provide(DatabaseLive))
      )
      await db.execute(
        sql`UPDATE notifications SET status = 'pending', queued_at = NULL, retry_count = 2 WHERE user_id = ${userId}`
      )
      const [message] = await enqueuePending()
      if (!message) throw new Error('nothing was enqueued')
      const refuseDeadLetters = sql.raw(`
        CREATE FUNCTION refuse_dead_letter() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'dead letter refused';
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER refuse_dead_letter BEFORE INSERT ON dead_letter_messages
          FOR EACH ROW EXECUTE FUNCTION refuse_dead_letter();
      `)
      const allowDeadLetters = sql.raw(`
        DROP TRIGGER IF EXISTS refuse_dead_letter ON dead_letter_messages;
        DROP FUNCTION IF EXISTS refuse_dead_letter();
      `)
      await db.execute(refuseDeadLetters)
      onTestFinished(async () => {
        await db.execute(allowDeadLetters)
      })

      const sent: AlertEvent[] = []
      const alerter = {
        layer: Layer.succeed(
          Alerter,
          Effect.runSync(
            makeAlerter((event) => Effect.sync(() => sent.push(event)), {
              environment: 'test',
              dedupeWindow: Duration.minutes(5),
              warningDedupeWindow: Duration.minutes(15),
            })
          )
        ),
        events: sent,
      }

      const refused = await consumeWhilePushIsDown(message, alerter)
      const refusedAgain = await consumeWhilePushIsDown(message, alerter)

      expect(Exit.isFailure(refused.exit)).toBe(true)
      expect(Exit.isFailure(refusedAgain.exit)).toBe(true)
      expect([...refused.acked, ...refusedAgain.acked]).toEqual([])
      expect(await attemptRows()).toEqual([
        { status: 'queued', retryCount: 2, deliveryMessageId: message.id },
      ])
      expect(await deadLettersFor(message)).toEqual([])
      expect(sent).toEqual([
        {
          _tag: 'OperationalWarning',
          source: 'notification-worker',
          summary: 'Failed push could not be recorded',
          context: {
            messageId: message.id,
            topic: 'new_follower',
            notificationIds: message.payload.notificationIds,
            reason: 'UnknownError',
            sqlState: 'P0001',
          },
        },
      ])

      await db.execute(allowDeadLetters)
      const redelivered = await consumeWhilePushIsDown(message)

      expect(Exit.isSuccess(redelivered.exit)).toBe(true)
      expect(redelivered.acked).toHaveLength(1)
      expect(redelivered.alerts).toEqual([
        expect.objectContaining({
          summary: 'Message moved to dead letter queue',
        }),
      ])
      expect(await attemptRows()).toEqual([
        { status: 'failed', retryCount: 3, deliveryMessageId: message.id },
      ])
      expect(await deadLettersFor(message)).toEqual([
        { originalMessageId: message.id },
      ])
    })

    it('reports neither the retry nor the dead letter when the commit that records them is refused', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const sqlClient = yield* SqlClient.SqlClient
          yield* sqlClient.withTransaction(recordFollowFor(userId))
          yield* sqlClient.withTransaction(recordFollowFor(userId))
        }).pipe(Effect.provide(DatabaseLive))
      )
      await db.execute(
        sql`UPDATE notifications SET status = 'pending', queued_at = NULL, retry_count = 0 WHERE user_id = ${userId}`
      )
      await db.execute(
        sql`UPDATE notifications SET retry_count = 2 WHERE id = (SELECT id FROM notifications WHERE user_id = ${userId} ORDER BY id LIMIT 1)`
      )
      const [spent, fresh] = await enqueuePending()
      if (!spent || !fresh) throw new Error('expected two messages')
      const message: QueueMessage = {
        ...spent,
        payload: {
          ...spent.payload,
          notificationIds: [
            ...spent.payload.notificationIds,
            ...fresh.payload.notificationIds,
          ],
        },
      }
      const refuseAtCommit = sql.raw(`
        CREATE FUNCTION refuse_at_commit() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'commit refused';
        END $$ LANGUAGE plpgsql;
        CREATE CONSTRAINT TRIGGER refuse_at_commit AFTER INSERT ON dead_letter_messages
          DEFERRABLE INITIALLY DEFERRED
          FOR EACH ROW EXECUTE FUNCTION refuse_at_commit();
      `)
      const allowCommit = sql.raw(`
        DROP TRIGGER IF EXISTS refuse_at_commit ON dead_letter_messages;
        DROP FUNCTION IF EXISTS refuse_at_commit();
      `)
      await db.execute(refuseAtCommit)
      onTestFinished(async () => {
        await db.execute(allowCommit)
      })

      const refused = await consumeWhilePushIsDown(message)

      expect(Exit.isFailure(refused.exit)).toBe(true)
      expect(refused.acked).toEqual([])
      expect(refused.alerts).toEqual([
        expect.objectContaining({
          summary: 'Failed push could not be recorded',
        }),
      ])
      expect(refused.warnings).not.toContain('Retrying notification')
      expect(
        (await attemptRows()).map((row) => [row.status, row.retryCount]).sort()
      ).toEqual([
        ['queued', 0],
        ['queued', 2],
      ])
      expect(await deadLettersFor(message)).toEqual([])

      await db.execute(allowCommit)
      const redelivered = await consumeWhilePushIsDown(message)

      expect(Exit.isSuccess(redelivered.exit)).toBe(true)
      expect(redelivered.acked).toHaveLength(1)
      expect(redelivered.alerts).toEqual([
        expect.objectContaining({
          summary: 'Message moved to dead letter queue',
        }),
      ])
      expect(redelivered.warnings).toContain('Retrying notification')
      expect(
        (await attemptRows()).map((row) => [row.status, row.retryCount]).sort()
      ).toEqual([
        ['failed', 3],
        ['pending', 1],
      ])
      expect(await deadLettersFor(message)).toHaveLength(1)
    })

    it('puts a notification whose every push ticket failed back to pending, naming the code and not the token', async () => {
      await Effect.runPromise(
        recordNotificationAt(
          'new_follower',
          userId,
          { senderName: 'Ada' },
          'en',
          { senderId: 'ada' },
          { scheduledAt: new Date(Date.now() - 60_000) }
        ).pipe(Effect.provide(DatabaseLive))
      )

      const enqueued = await deliverPending(
        createMockPushService({
          batchTickets: (msgs) =>
            msgs.map(() => ({
              id: crypto.randomUUID(),
              status: 'error',
              code: 'DeviceNotRegistered',
            })),
        })
      )

      expect(enqueued).toHaveLength(1)
      const rows = await db
        .select({
          status: schema.notifications.status,
          retryCount: schema.notifications.retryCount,
          lastError: schema.notifications.lastError,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userId))
      expect(rows).toEqual([
        {
          status: 'pending',
          retryCount: 1,
          lastError:
            'PushSendError: Every push ticket failed: DeviceNotRegistered (1)',
        },
      ])
    })

    const followLayer = (enqueued: QueueMessage[]) =>
      Layer.mergeAll(
        DatabaseLive,
        FollowRepositoryLive.pipe(Layer.provide(DatabaseLive)),
        createMockEventBus({ publishedEvents: [] }),
        createMockCurrentUser({ id: userId, name: 'outbox_user' }),
        createMockMessageQueue({
          onEnqueue: (_, message) => enqueued.push(message),
        })
      )

    const seedFollowTarget = async () => {
      const [target] = await db
        .insert(schema.users)
        .values({
          email: `target-${Date.now()}@example.com`,
          name: 'target',
          emailVerified: true,
          publicProfile: true,
        })
        .returning({ id: schema.users.id })
      if (!target) throw new Error('Failed to seed follow target')
      return target.id
    }

    it('commits a follow with its queued notification and pushes that row', async () => {
      const targetId = await seedFollowTarget()
      const enqueued: QueueMessage[] = []

      await Effect.runPromise(
        followUser(targetId).pipe(
          Effect.provide(followLayer(enqueued)),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(
        await db
          .select({ followingId: schema.userFollows.followingId })
          .from(schema.userFollows)
          .where(eq(schema.userFollows.followerId, userId))
      ).toEqual([{ followingId: targetId }])
      const rows = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, targetId))
      expect(rows).toEqual([
        expect.objectContaining({
          type: 'new_follower',
          status: 'queued',
          plantId: null,
          title: '👋 New follower!',
          body: 'outbox_user started following your plant journey',
          params: { senderName: 'outbox_user' },
          metadata: { senderId: userId },
          queuedAt: expect.any(Date),
          scheduledAt: expect.any(Date),
        }),
      ])
      expect(enqueued.map((message) => message.payload)).toEqual([
        {
          userId: targetId,
          notificationIds: [rows[0]?.id],
          plantIds: [],
          metadata: { senderId: userId },
        },
      ])
    })

    it('rolls a new follow back when its notification insert fails', async () => {
      const targetId = await seedFollowTarget()
      await db.execute(
        sql.raw(`
          CREATE FUNCTION refuse_follow_notification() RETURNS trigger AS $$
          BEGIN
            RAISE EXCEPTION 'notification refused';
          END $$ LANGUAGE plpgsql;
          CREATE TRIGGER refuse_follow_notification BEFORE INSERT ON notifications
            FOR EACH ROW EXECUTE FUNCTION refuse_follow_notification();
        `)
      )
      onTestFinished(async () => {
        await db.execute(
          sql.raw(`
            DROP TRIGGER refuse_follow_notification ON notifications;
            DROP FUNCTION refuse_follow_notification();
          `)
        )
      })
      const enqueued: QueueMessage[] = []

      const exit = await Effect.runPromiseExit(
        followUser(targetId).pipe(
          Effect.provide(followLayer(enqueued)),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(await db.select().from(schema.userFollows)).toEqual([])
      expect(await db.select().from(schema.notifications)).toEqual([])
      expect(enqueued).toEqual([])
    })

    it('records no notification when the follow insert fails', async () => {
      const targetId = await seedFollowTarget()
      await db
        .insert(schema.userFollows)
        .values({ followerId: userId, followingId: targetId })

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const follows = yield* FollowRepository
          return yield* follows.follow(userId, targetId, {
            title: 'title',
            body: 'body',
            params: { senderName: 'Ada' },
            metadata: { senderId: userId },
          })
        }).pipe(
          Effect.provide(FollowRepositoryLive.pipe(Layer.provide(DatabaseLive)))
        )
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(await db.select().from(schema.notifications)).toEqual([])
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
              createMockMessageQueue(),
              MockOutboxLive
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
