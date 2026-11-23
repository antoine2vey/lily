import {
  deadlocks,
  holdRowUntilWaited,
  sessionsWaitingForALock,
} from '@lily/api/__tests__/integration/lock-waits'
import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockAlerter } from '@lily/api/__tests__/mocks/alerter'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { CareReadsLive } from '@lily/api/contexts/care'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { makeRedisMessageQueue } from '@lily/api/services/message-queue/redis.provider'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import {
  consumeNext,
  recoverStrandedDeliveries,
  VISIBILITY_TIMEOUT,
} from '@lily/api/services/notification-scheduler/worker'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  type IMessageQueue,
  MessageQueue,
  PushService,
} from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Duration, Effect, Layer, References } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import Redis from 'ioredis'
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

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST ?? ''
const REDIS_URL_TEST = process.env.REDIS_URL_TEST ?? ''
const QUEUE_KEY = 'lily:queue:notifications'
const IN_FLIGHT_KEY = `${QUEUE_KEY}:in-flight`
const CLAIMED_AT_KEY = `${QUEUE_KEY}:in-flight:claimed-at`
const QUEUE_KEYS = [QUEUE_KEY, IN_FLIGHT_KEY, CLAIMED_AT_KEY]
const PAST_VISIBILITY = Duration.toMillis(VISIBILITY_TIMEOUT) + 60_000
const LAST_RETRY = 2
const AFTER_A_RETRY = 4242
const LOCK_NOT_AVAILABLE = '55P03'
const RETRIED = '00000000-0000-4000-8000-0000000000b1'
const EXHAUSTED = '00000000-0000-4000-8000-0000000000b2'

const DatabaseLive = Layer.mergeAll(
  NotificationRepositoryLive,
  DeadLetterRepositoryLive,
  UserRepositoryLive,
  PlantRepositoryLive,
  DeviceTokenRepositoryLive,
  CanopyRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const quiet = Effect.provideService(References.MinimumLogLevel, 'None')

const CannotReadTheDatabase = Layer.effect(
  NotificationRepository,
  Effect.map(NotificationRepository, (repository) =>
    NotificationRepository.of({
      ...repository,
      claimForDelivery: () =>
        Effect.fail(
          new SqlError({
            reason: new UnknownError({
              cause: new Error('database unreachable'),
              message: 'database unreachable',
            }),
          })
        ),
    })
  )
).pipe(Layer.provide(DatabaseLive))

describe.skipIf(!DATABASE_URL_TEST || !REDIS_URL_TEST)(
  'Runs of packages/api/models/queue-claims.qnt on Redis and Postgres - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let redis: Redis
    let queue: IMessageQueue
    let userId: string

    const pushes: string[] = []

    const sendsAtOnce = createMockPushService({
      onSendBatch: (messages) => pushes.push(...messages.map((m) => m.to)),
    })

    const pushFails = createMockPushService({ shouldFail: true })

    const stopsAtTheSend = () => {
      const reached = Promise.withResolvers<void>()
      const resumed = Promise.withResolvers<void>()
      const sends = Layer.effect(
        PushService,
        Effect.map(PushService, (push) => ({
          ...push,
          sendBatch: (messages: Parameters<typeof push.sendBatch>[0]) =>
            Effect.promise(() => {
              reached.resolve()
              return resumed.promise
            }).pipe(Effect.andThen(push.sendBatch(messages))),
        }))
      ).pipe(Layer.provide(sendsAtOnce))
      return { sends, reached: reached.promise, resume: resumed.resolve }
    }

    const poll = (enqueuesOn: IMessageQueue = queue) =>
      Effect.runPromise(
        pollAndEnqueue.pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseLive,
              Layer.succeed(MessageQueue, enqueuesOn)
            )
          ),
          quiet
        )
      )

    const consume = (
      sends: Layer.Layer<PushService> = sendsAtOnce,
      alerter = createMockAlerter(),
      rows: typeof CannotReadTheDatabase = DatabaseLive
    ) =>
      Effect.runPromiseExit(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseLive,
              Layer.succeed(MessageQueue, queue),
              alerter.layer,
              sends,
              createMockActivityPushTokenRepository(),
              createMockCareLogRepository([]),
              rows
            )
          ),
          quiet
        )
      )

    const sweep = () =>
      Effect.runPromise(
        recoverStrandedDeliveries.pipe(
          Effect.provide(
            Layer.mergeAll(DatabaseLive, Layer.succeed(MessageQueue, queue))
          ),
          quiet
        )
      )

    const claimsGoStale = async () => {
      const claims = await redis.zrange(CLAIMED_AT_KEY, 0, '-1')
      const staleAt = Date.now() - PAST_VISIBILITY
      for (const claim of claims)
        await redis.zadd(CLAIMED_AT_KEY, 'XX', staleAt, claim)
    }

    const dueRow = async (id?: string) => {
      const [row] = await db
        .insert(schema.notifications)
        .values({
          ...(id === undefined ? {} : { id }),
          type: 'new_follower',
          title: 'New follower',
          body: 'Ada started following your plant journey',
          params: { senderName: 'Ada' },
          metadata: { senderId: 'ada' },
          userId,
          scheduledAt: new Date(Date.now() - 60_000),
          status: 'pending',
        })
        .returning({ id: schema.notifications.id })
      if (!row) throw new Error('Failed to insert the due notification')
      return row.id
    }

    const rowStatus = async (id: string) => {
      const [row] = await db
        .select({ status: schema.notifications.status })
        .from(schema.notifications)
        .where(eq(schema.notifications.id, id))
      return row?.status
    }

    const row = async (id: string) => {
      const [found] = await db
        .select({
          status: schema.notifications.status,
          retryCount: schema.notifications.retryCount,
          heldBy: schema.notifications.deliveryMessageId,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.id, id))
      return found
    }

    const deadLetters = async () => {
      const stored = await db.execute(
        sql`SELECT count(*)::int AS count FROM dead_letter_messages`
      )
      return stored.rows[0]?.count
    }

    const exhaustedAlerts = (alerter: ReturnType<typeof createMockAlerter>) =>
      alerter.events.filter(
        (event) =>
          event._tag === 'warning' &&
          event.summary === 'Message moved to dead letter queue'
      ).length

    const refuseDeadLetters = async () => {
      const allow = sql.raw(`
        DROP TRIGGER IF EXISTS refuse_dead_letter ON dead_letter_messages;
        DROP FUNCTION IF EXISTS refuse_dead_letter();
      `)
      await db.execute(
        sql.raw(`
        CREATE FUNCTION refuse_dead_letter() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'dead letter refused';
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER refuse_dead_letter BEFORE INSERT ON dead_letter_messages
          FOR EACH ROW EXECUTE FUNCTION refuse_dead_letter();
      `)
      )
      onTestFinished(async () => {
        await db.execute(allow)
      })
      return () => db.execute(allow)
    }

    const heldByAnotherSession = async (id: string) => {
      const prober = await pool.connect()
      try {
        await prober.query('BEGIN')
        await prober.query(
          'SELECT id FROM notifications WHERE id = $1 FOR UPDATE NOWAIT',
          [id]
        )
        return false
      } catch (error) {
        if (
          error instanceof pg.DatabaseError &&
          error.code === LOCK_NOT_AVAILABLE
        )
          return true
        throw error
      } finally {
        await prober.query('ROLLBACK').finally(() => prober.release())
      }
    }

    const stopAfterARetryStatement = async () => {
      await db.execute(
        sql.raw(`
        CREATE FUNCTION wait_after_a_retry() RETURNS trigger AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM moved WHERE status = 'pending' AND retry_count > 0) THEN
            PERFORM pg_advisory_xact_lock(${AFTER_A_RETRY});
          END IF;
          RETURN NULL;
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER wait_after_a_retry AFTER UPDATE ON notifications
          REFERENCING NEW TABLE AS moved
          FOR EACH STATEMENT EXECUTE FUNCTION wait_after_a_retry();
      `)
      )
      const holder = await pool.connect()
      await holder.query('SELECT pg_advisory_lock($1)', [AFTER_A_RETRY])
      const resume = async () => {
        await holder.query('SELECT pg_advisory_unlock_all()')
      }
      onTestFinished(async () => {
        await resume().finally(() => holder.release())
        await db.execute(
          sql.raw(`
          DROP TRIGGER IF EXISTS wait_after_a_retry ON notifications;
          DROP FUNCTION IF EXISTS wait_after_a_retry();
        `)
        )
      })
      return resume
    }

    const resetDb = async () => {
      await db.execute(
        sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE dead_letter_messages`)
      await db.execute(
        sql`TRUNCATE TABLE device_tokens RESTART IDENTITY CASCADE`
      )
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    }

    beforeAll(() => {
      pool = new pg.Pool({ connectionString: DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      redis = new Redis(REDIS_URL_TEST)
      queue = makeRedisMessageQueue(redis)
    })

    beforeEach(async () => {
      pushes.length = 0
      await redis.del(...QUEUE_KEYS)
      await resetDb()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `queue-claims-${Date.now()}@example.com`,
          name: 'queue_claims_user',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning({ id: schema.users.id })
      if (!user) throw new Error('Failed to create test user')
      userId = user.id
      await db
        .insert(schema.deviceTokens)
        .values({ token: 'expo-queue-claims-token', platform: 'ios', userId })
    })

    afterAll(async () => {
      await redis.del(...QUEUE_KEYS)
      redis.disconnect()
      await resetDb()
      await pool.end()
    })

    it('doublePoll: a poll that overlaps another enqueues nothing for the row the first one took', async () => {
      const id = await dueRow()
      const reached = Promise.withResolvers<void>()
      const resumed = Promise.withResolvers<void>()
      const first = poll({
        ...queue,
        enqueue: (message) =>
          Effect.promise(() => {
            reached.resolve()
            return resumed.promise
          }).pipe(Effect.andThen(queue.enqueue(message))),
      })
      await reached.promise

      await poll()
      resumed.resolve()
      await first

      await consume()
      await consume()

      expect(
        pushes,
        'pushes of one due notification that two overlapping polls both saw'
      ).toHaveLength(1)
      expect(await rowStatus(id)).toBe('sent')
      expect(await redis.exists(...QUEUE_KEYS)).toBe(0)
    }, 20_000)

    it('backlogRelease: two messages that name one row race for it and one pushes', async () => {
      const id = await dueRow()
      await poll()
      await db.execute(
        sql`UPDATE notifications SET queued_at = now() - interval '11 minutes' WHERE id = ${id}`
      )
      await sweep()
      await poll()
      expect(await redis.llen(QUEUE_KEY)).toBe(2)

      const { waiting, result } = await holdRowUntilWaited(
        pool,
        'SELECT id FROM notifications WHERE id = $1 FOR UPDATE',
        [id],
        () => Promise.all([consume(), consume()])
      )
      await result

      expect(waiting).toBe(2)
      expect(
        pushes,
        'pushes of one notification that two queued messages both name'
      ).toHaveLength(1)
      expect(await rowStatus(id)).toBe('sent')
      expect(await redis.exists(...QUEUE_KEYS)).toBe(0)
    }, 20_000)

    it("lateAck: a stalled consumer's late ack leaves the redelivery in flight", async () => {
      const id = await dueRow()
      await poll()

      const stalled = stopsAtTheSend()
      const first = consume(stalled.sends)
      await stalled.reached
      await claimsGoStale()
      await sweep()
      expect(await redis.llen(QUEUE_KEY)).toBe(1)

      const second = stopsAtTheSend()
      const redelivery = consume(second.sends)
      await second.reached

      stalled.resume()
      await first

      expect(
        [await redis.hlen(IN_FLIGHT_KEY), await redis.zcard(CLAIMED_AT_KEY)],
        'in-flight entries and claim times left for the redelivery after the stalled consumer acked'
      ).toEqual([1, 1])

      await claimsGoStale()
      expect(
        await Effect.runPromise(queue.requeueStale(VISIBILITY_TIMEOUT)),
        'redeliveries the sweep can still put back after the stalled consumer acked'
      ).toBe(1)

      second.resume()
      await redelivery
      expect(await rowStatus(id)).toBe('sent')
    }, 20_000)

    it('deadLetterWriteFailsOnce: a poison entry is dead-lettered once and alerted once, after its dead letter exists', async () => {
      const id = await dueRow()
      await poll()
      await redis.del(QUEUE_KEY)
      const poison = JSON.stringify({
        id: 'poison-1',
        topic: 'no_such_topic',
        payload: { notificationIds: [id] },
      })
      await redis.lpush(QUEUE_KEY, poison)
      const allowDeadLetters = await refuseDeadLetters()
      const alerter = createMockAlerter()

      await consume(sendsAtOnce, alerter)

      expect(
        [alerter.events.length, await deadLetters()],
        'alerts and dead letters while the dead letter cannot be written'
      ).toEqual([0, 0])
      expect(await redis.hlen(IN_FLIGHT_KEY)).toBe(1)

      await allowDeadLetters()
      await claimsGoStale()
      await sweep()
      await consume(sendsAtOnce, alerter)

      expect(
        [alerter.events.length, await deadLetters()],
        'alerts and dead letters of one poison entry whose first dead-letter write failed'
      ).toEqual([1, 1])
      expect(await rowStatus(id)).toBe('failed')
      expect(pushes).toHaveLength(0)
      expect(await redis.exists(...QUEUE_KEYS)).toBe(0)
    }, 20_000)

    it('thirdFailureDeadLetterFails: a last failure whose dead letter cannot be written stays queued, and its redelivery fails the row once', async () => {
      const id = await dueRow()
      await db.execute(
        sql`UPDATE notifications SET retry_count = ${LAST_RETRY} WHERE id = ${id}`
      )
      await poll()
      const allowDeadLetters = await refuseDeadLetters()
      const alerter = createMockAlerter()

      await consume(pushFails, alerter)

      expect(
        [exhaustedAlerts(alerter), await deadLetters(), await row(id)],
        'the row and its reports while the dead letter cannot be written'
      ).toEqual([
        0,
        0,
        expect.objectContaining({ status: 'queued', retryCount: LAST_RETRY }),
      ])
      expect(await redis.hlen(IN_FLIGHT_KEY)).toBe(1)

      await allowDeadLetters()
      await claimsGoStale()
      await sweep()
      await consume(pushFails, alerter)

      expect(
        [exhaustedAlerts(alerter), await deadLetters(), await row(id)],
        'the row and its reports after the redelivery failed too'
      ).toEqual([
        1,
        1,
        expect.objectContaining({
          status: 'failed',
          retryCount: LAST_RETRY + 1,
        }),
      ])
      expect(await redis.exists(...QUEUE_KEYS)).toBe(0)
    }, 20_000)

    it('foreignRow: a message that fails without holding the row leaves it to the message that holds it', async () => {
      const id = await dueRow()
      await poll()
      await db.execute(
        sql`UPDATE notifications SET queued_at = now() - interval '11 minutes' WHERE id = ${id}`
      )
      await sweep()
      await poll()
      expect(await redis.llen(QUEUE_KEY)).toBe(2)

      const holder = stopsAtTheSend()
      const held = consume(holder.sends)
      await holder.reached
      const heldBy = (await row(id))?.heldBy
      const alerter = createMockAlerter()

      await consume(sendsAtOnce, alerter, CannotReadTheDatabase)
      await consume(sendsAtOnce, alerter, CannotReadTheDatabase)

      expect(heldBy).toEqual(expect.any(String))
      expect(
        [exhaustedAlerts(alerter), await deadLetters(), await row(id)],
        'the row another message holds, after a message that could not claim it failed'
      ).toEqual([0, 0, { status: 'queued', retryCount: 0, heldBy }])
      expect(await redis.llen(QUEUE_KEY)).toBe(0)
      expect(await redis.hlen(IN_FLIGHT_KEY)).toBe(1)

      holder.resume()
      await held
      expect(await rowStatus(id)).toBe('sent')
    }, 20_000)

    it.each([
      ['the exhausted row', [EXHAUSTED, RETRIED]],
      ['the retried row', [RETRIED, EXHAUSTED]],
    ])(
      'retryLater is one UPDATE: it holds both rows of the message once it has written one, and the sweep behind it fails neither (%s inserted first)',
      async (_, inserted) => {
        for (const id of inserted) await dueRow(id)
        await poll()
        const [entry] = await redis.lrange(QUEUE_KEY, 0, 0)
        const message = JSON.parse(entry ?? '{}')
        await redis.del(QUEUE_KEY)
        await redis.lpush(
          QUEUE_KEY,
          JSON.stringify({
            ...message,
            payload: {
              ...message.payload,
              notificationIds: [RETRIED, EXHAUSTED],
            },
          })
        )
        await db.execute(
          sql`UPDATE notifications SET queued_at = now() - interval '2 hours'`
        )
        await db.execute(
          sql`UPDATE notifications SET retry_count = ${LAST_RETRY} WHERE id = ${EXHAUSTED}`
        )
        const deadlocksBefore = await deadlocks(pool)
        const resume = await stopAfterARetryStatement()
        const alerter = createMockAlerter()

        const retry = consume(pushFails, alerter)
        expect(await sessionsWaitingForALock(pool, 1)).toBe(1)
        expect(
          [
            await heldByAnotherSession(RETRIED),
            await heldByAnotherSession(EXHAUSTED),
          ],
          'whether the retry holds the retried row and the exhausted row after the statement that retried one'
        ).toEqual([true, true])
        const swept = sweep()
        expect(await sessionsWaitingForALock(pool, 2)).toBe(2)
        await resume()
        await retry
        await swept

        expect(
          [await row(RETRIED), await row(EXHAUSTED)],
          'the two rows of one message after its push failed and the sweep ran behind the retry'
        ).toEqual([
          { status: 'pending', retryCount: 1, heldBy: null },
          { status: 'failed', retryCount: LAST_RETRY + 1, heldBy: message.id },
        ])
        expect([exhaustedAlerts(alerter), await deadLetters()]).toEqual([1, 1])
        expect((await deadlocks(pool)) - deadlocksBefore).toBe(0)
      },
      30_000
    )
  }
)
