import { settled } from '@lily/api/__tests__/integration/canopy-layers'
import { sessionsWaitingForALock } from '@lily/api/__tests__/integration/lock-waits'
import { NoStoredPhotosLive } from '@lily/api/__tests__/mocks/account-photo.repository'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import {
  createMockPushService,
  createSuccessPushService,
} from '@lily/api/__tests__/mocks/push.service'
import { createInMemoryRedisQueue } from '@lily/api/__tests__/mocks/redis-queue'
import { createMockRevenueCatProvider } from '@lily/api/__tests__/mocks/revenuecat.provider'
import { AbsenceTopic } from '@lily/api/contexts/absence/domain/events'
import { CanopyTopic } from '@lily/api/contexts/canopy/domain/events'
import { CareReadsLive } from '@lily/api/contexts/care'
import { ReminderStoreLive } from '@lily/api/contexts/reminders'
import {
  ConsumerFailed,
  consumer,
  makeOutbox,
  type OutboxTopic,
} from '@lily/api/kernel/outbox'
import { transactQuietly } from '@lily/api/kernel/transact'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { NotificationDeliveryLive } from '@lily/api/repositories/notification-delivery.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { MessageQueue } from '@lily/api/services/message-queue/service'
import { consumeNext } from '@lily/api/services/notification-scheduler/worker'
import { handleRevenueCatWebhook } from '@lily/api/services/subscriptions/endpoints/webhook/handle-revenuecat-webhook'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Exit, Layer, ManagedRuntime, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const BaseLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DeadLetterRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  NotificationDeliveryLive,
  ReminderStoreLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  RoomRepositoryLive,
  SubscriptionRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

type Base = Layer.Success<typeof BaseLive>

const FAILING_CONSUMER = 'always-fails'

const failing = <E>(from: OutboxTopic<E>) =>
  consumer(FAILING_CONSUMER, from, () =>
    Effect.fail(ConsumerFailed.because(FAILING_CONSUMER, 'down'))
  )

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'What a purged account leaves behind - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let runtime: ManagedRuntime.ManagedRuntime<
      Base,
      Layer.Error<typeof BaseLive>
    >

    const exitOf = <A, E>(effect: Effect.Effect<A, E, unknown>) =>
      runtime.runPromiseExit(
        effect.pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockEventBus(),
              NoStoredPhotosLive,
              createMockLimitChecker(),
              createMockMessageQueue(),
              createMockPushService(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Base>
      )

    const purge = (userId: string) => exitOf(settled(purgeAccount(userId)))

    const user = async (name: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${crypto.randomUUID()}@example.com`,
          name: `${name}_${crypto.randomUUID()}`,
          emailVerified: true,
        })
        .returning()
      if (!row) throw new Error('user insert returned nothing')
      return row.id
    }

    const deliver = (appUserId: string, eventId: string) =>
      exitOf(
        handleRevenueCatWebhook(
          JSON.stringify({
            api_version: '1.0',
            event: {
              type: 'EXPIRATION',
              id: eventId,
              app_user_id: appUserId,
              original_app_user_id: appUserId,
              product_id: 'lily_monthly',
              store: 'APP_STORE',
              environment: 'PRODUCTION',
              original_transaction_id: 'txn-1',
            },
          }),
          'Bearer test'
        ).pipe(Effect.provide(createMockRevenueCatProvider()))
      )

    const webhookEventsOf = async (appUserId: string) =>
      Array.map(
        await db
          .select({ id: schema.revenuecatWebhookEvents.id })
          .from(schema.revenuecatWebhookEvents)
          .where(eq(schema.revenuecatWebhookEvents.appUserId, appUserId)),
        (row) => row.id
      )

    const deadLettersNaming = async (userId: string) => {
      const { rows } = await db.execute<{ topic: string }>(sql`
        SELECT topic FROM dead_letter_messages
        WHERE user_id = ${userId}::uuid OR strpos(payload::text, ${userId}) > 0
        ORDER BY topic
      `)
      return Array.map(rows, (row) => row.topic)
    }

    const poison = async (raw: string) => {
      const { queue, acked } = createInMemoryRedisQueue([raw])
      const exit = await exitOf(
        consumeNext.pipe(
          Effect.provide(
            Layer.merge(
              Layer.succeed(MessageQueue, queue),
              createSuccessPushService
            )
          )
        )
      )
      if (Exit.isFailure(exit) || !Array.contains(acked, raw)) {
        throw new Error(`the worker did not discard ${raw}`)
      }
    }

    const deadLetterOutboxEvents = <E>(
      to: OutboxTopic<E>,
      events: ReadonlyArray<E>
    ) =>
      exitOf(
        Effect.gen(function* () {
          const { service } = yield* makeOutbox([failing(to)], {
            maxAttempts: 1,
          })
          yield* transactQuietly(service.append(to, events))
          return yield* service.drain
        })
      ).then((exit) => {
        if (Exit.isFailure(exit)) throw new Error('the outbox did not drain')
      })

    beforeAll(() => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
    })

    beforeEach(async () => {
      await db.execute(
        sql`TRUNCATE TABLE users, canopies, outbox, dead_letter_messages, revenuecat_webhook_events RESTART IDENTITY CASCADE`
      )
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    it('records no RevenueCat event that arrives after the purge, and still records one for a living account', async () => {
      const purged = await user('sam')
      const living = await user('alex')
      expect(Exit.isSuccess(await purge(purged))).toBe(true)

      const late = await deliver(purged, `expiration-${purged}`)
      const kept = await deliver(living, `expiration-${living}`)

      expect([late._tag, kept._tag]).toEqual(['Success', 'Success'])
      expect(await webhookEventsOf(purged)).toEqual([])
      expect(await webhookEventsOf(living)).toEqual([`expiration-${living}`])
    })

    it('answers a RevenueCat event for an id that is not a Lily user id, and records nothing', async () => {
      const anonymous = '$RCAnonymousID:8b1f0c7e2d6a4f1e9c3b5a7d0e2f4a6c'

      const exit = await deliver(anonymous, 'expiration-anonymous')

      expect(exit._tag).toBe('Success')
      expect(await webhookEventsOf(anonymous)).toEqual([])
    })

    it('leaves no event of the account when the purge starts while a webhook holds it and commits after the webhook', async () => {
      const purged = await user('sam')
      const eventId = `expiration-${purged}`
      const blocker = await pool.connect()
      try {
        await blocker.query('BEGIN')
        await blocker.query(
          `INSERT INTO revenuecat_webhook_events (id, event_type, app_user_id, environment) VALUES ($1, 'EXPIRATION', $2, 'PRODUCTION')`,
          [eventId, purged]
        )
        const webhook = deliver(purged, eventId)
        const webhookWaited = await sessionsWaitingForALock(pool, 1)
        const purging = purge(purged)
        const bothWaited = await sessionsWaitingForALock(pool, 2)
        await blocker.query('ROLLBACK')
        const [webhookExit, purgeExit] = await Promise.all([webhook, purging])

        expect([webhookExit._tag, purgeExit._tag]).toEqual([
          'Success',
          'Success',
        ])
        expect(await webhookEventsOf(purged)).toEqual([])
        expect([webhookWaited, bothWaited]).toEqual([1, 2])
      } finally {
        blocker.release()
      }
    })

    it('deletes every dead letter that names the purged user, from the poison path and the outbox, and keeps those of another user', async () => {
      const purged = await user('sam')
      const other = await user('alex')
      const canopyId = crypto.randomUUID()

      await poison(
        JSON.stringify({
          id: `poison-${purged}`,
          topic: 'bogus',
          payload: { userId: purged, notificationIds: ['nope'] },
        })
      )
      await poison(`not json ${purged} \u0000`)
      await poison(
        JSON.stringify({
          id: `poison-${other}`,
          topic: 'bogus',
          payload: { userId: other, notificationIds: ['nope'] },
        })
      )
      await deadLetterOutboxEvents(CanopyTopic, [
        { _tag: 'MemberLeft', canopyId, userId: purged, reason: 'left' },
        { _tag: 'MemberLeft', canopyId, userId: other, reason: 'left' },
      ])
      await deadLetterOutboxEvents(AbsenceTopic, [
        {
          _tag: 'DelegationStarted',
          delegationId: crypto.randomUUID(),
          ownerId: other,
          caretakerId: purged,
          plantIds: [],
        },
      ])
      expect(await deadLettersNaming(purged)).toEqual([
        'bogus',
        'outbox:absence:always-fails',
        'outbox:canopy:always-fails',
        'unknown',
      ])

      expect(Exit.isSuccess(await purge(purged))).toBe(true)

      expect(await deadLettersNaming(purged)).toEqual([])
      expect(await deadLettersNaming(other)).toEqual([
        'bogus',
        'outbox:canopy:always-fails',
      ])
    })

    it('deletes the events and the dead letters of the user when the purge is given the id in upper case', async () => {
      const purged = await user('sam')
      expect((await deliver(purged, `expiration-${purged}`))._tag).toBe(
        'Success'
      )
      await poison(`not json ${purged} \u0000`)
      expect([
        await webhookEventsOf(purged),
        await deadLettersNaming(purged),
      ]).toEqual([[`expiration-${purged}`], ['unknown']])

      expect(Exit.isSuccess(await purge(purged.toUpperCase()))).toBe(true)

      expect([
        await webhookEventsOf(purged),
        await deadLettersNaming(purged),
      ]).toEqual([[], []])
    })
  }
)
