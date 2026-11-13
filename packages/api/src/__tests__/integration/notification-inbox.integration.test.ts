import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockAlerter } from '@lily/api/__tests__/mocks/alerter'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createInMemoryRedisQueue } from '@lily/api/__tests__/mocks/redis-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { FollowRepositoryLive } from '@lily/api/repositories/follow.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import {
  dispatchNow,
  recordNotification,
  recordNotificationAt,
} from '@lily/api/services/helpers/schedule-notification'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import {
  buildCareDigestContent,
  buildSimpleContent,
} from '@lily/api/services/notification-scheduler/translations'
import { consumeNext } from '@lily/api/services/notification-scheduler/worker'
import { getNotifications } from '@lily/api/services/notifications/endpoints/get-notifications'
import { followUser } from '@lily/api/services/social/endpoints/follow-user'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { NotificationsListResponse } from '@lily/shared/notification'
import { MessageQueue, type QueueMessage } from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer, References, Schema } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const DatabaseLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const FILTERS = [
  undefined,
  'all',
  'pending',
  'queued',
  'failed',
  'sent',
] as const

type Listed = {
  readonly status: unknown
  readonly title: unknown
  readonly body: unknown
}

const STREAK_AT_RISK = buildSimpleContent(
  'streak_at_risk',
  { streakCount: 5 },
  'en'
)

const thirsty = (plantName: string, language: 'en' | 'fr') =>
  buildCareDigestContent(
    [{ plantName, careTypes: ['watering_reminder'] }],
    language
  )

const fernThirsty = (language: 'en' | 'fr') => thirsty('Fern', language)

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Inbox text of rows that are not sent yet - Integration',
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

    const quiet = <A, E>(effect: Effect.Effect<A, E>) =>
      Effect.runPromise(
        effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
      )

    const run = <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof DatabaseLive>>
    ) => quiet(effect.pipe(Effect.provide(DatabaseLive)))

    let seq = 0
    const seedUser = async (language: 'en' | 'fr' = 'en') => {
      seq += 1
      const stamp = `inbox-${Date.now()}-${seq}`
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${stamp}@example.com`,
          name: stamp,
          emailVerified: true,
          timezone: 'UTC',
          language,
          publicProfile: true,
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      await db.insert(schema.deviceTokens).values({
        token: `ExponentPushToken[${stamp}]`,
        platform: 'ios',
        userId: user.id,
      })
      return user
    }

    const seedCareRow = async (userId: string, scheduledAt: Date) => {
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
      if (!plant) throw new Error('plant insert returned nothing')
      await db.insert(schema.plantCareSchedules).values({
        plantId: plant.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: new Date(Date.now() - 86_400_000),
      })
      await db.insert(schema.notifications).values({
        type: 'watering_reminder',
        scheduledAt,
        userId,
        plantId: plant.id,
      })
    }

    const capturing = () => {
      const enqueued: QueueMessage[] = []
      const queue = createMockMessageQueue({
        onEnqueue: (_topic, message) => {
          enqueued.push(message)
        },
      })
      return { enqueued, queue }
    }

    const enqueueDueFor = async (userId: string) => {
      const { enqueued, queue } = capturing()
      await run(pollAndEnqueue.pipe(Effect.provide(queue)))
      expect(Array.map(enqueued, (message) => message.payload.userId)).toEqual([
        userId,
      ])
      const [message] = enqueued
      if (!message) throw new Error('nothing enqueued')
      return message
    }

    const dispatch = async (
      recorded: Parameters<typeof dispatchNow>[0]
    ): Promise<QueueMessage> => {
      const { enqueued, queue } = capturing()
      await run(dispatchNow(recorded).pipe(Effect.provide(queue)))
      const [message] = enqueued
      if (!message) throw new Error('nothing enqueued')
      return message
    }

    const consumeFailing = async (message: QueueMessage) => {
      const { queue } = createInMemoryRedisQueue([JSON.stringify(message)])
      await run(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              DeadLetterRepositoryLive.pipe(Layer.provide(DatabaseLive)),
              Layer.succeed(MessageQueue, queue),
              createMockAlerter().layer,
              createMockPushService({
                shouldFail: true,
                failureMessage: 'push down',
              }),
              createMockActivityPushTokenRepository(),
              createMockCareLogRepository([])
            )
          )
        )
      )
    }

    const makeDue = (userId: string) =>
      db
        .update(schema.notifications)
        .set({ scheduledAt: new Date(Date.now() - 1000) })
        .where(eq(schema.notifications.userId, userId))

    const failAgain = async (userId: string) => {
      await makeDue(userId)
      await consumeFailing(await enqueueDueFor(userId))
    }

    const inbox = async (userId: string) => {
      const reader = createMockCurrentUser({ id: userId, name: 'reader' })
      const listed: Record<string, ReadonlyArray<Listed>> = {}
      for (const status of FILTERS) {
        const wire = await run(
          getNotifications(status ? { status } : {}).pipe(
            Effect.flatMap(
              Schema.encodeUnknownEffect(NotificationsListResponse)
            ),
            Effect.provide(reader)
          )
        )
        listed[status ?? 'unset'] = Array.map(wire.items, (item) => ({
          status: item.status,
          title: item.title ?? null,
          body: item.body ?? null,
        }))
      }
      return listed
    }

    const rowState = (userId: string) =>
      db
        .select({
          status: schema.notifications.status,
          retryCount: schema.notifications.retryCount,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userId))

    const expectListed = async (userId: string, row: Listed) => {
      const listed = await inbox(userId)
      for (const filter of ['unset', 'all', String(row.status)]) {
        expect(listed[filter], `filter ${filter}`).toEqual([row])
      }
    }

    it('lists a simple row with its record-time text while it is pending, queued, retried or failed', async () => {
      const pending = await seedUser()
      await run(
        recordNotificationAt(
          'streak_milestone',
          pending.id,
          { streakCount: 7 },
          'en',
          {},
          { scheduledAt: new Date(Date.now() + 3_600_000) }
        )
      )

      const queued = await seedUser()
      await run(
        recordNotification(
          'streak_at_risk',
          queued.id,
          { streakCount: 5 },
          'en',
          {}
        )
      )

      const recordAndFail = async () => {
        const user = await seedUser()
        const recorded = await run(
          recordNotification(
            'streak_at_risk',
            user.id,
            { streakCount: 5 },
            'en',
            {}
          )
        )
        await consumeFailing(await dispatch(recorded))
        return user
      }
      const retried = await recordAndFail()
      const failed = await recordAndFail()
      await failAgain(failed.id)
      await failAgain(failed.id)

      expect(await rowState(retried.id)).toEqual([
        { status: 'pending', retryCount: 1 },
      ])
      expect(await rowState(failed.id)).toEqual([
        { status: 'failed', retryCount: 3 },
      ])
      await expectListed(pending.id, {
        status: 'pending',
        ...buildSimpleContent('streak_milestone', { streakCount: 7 }, 'en'),
      })
      await expectListed(queued.id, { status: 'queued', ...STREAK_AT_RISK })
      await expectListed(retried.id, { status: 'pending', ...STREAK_AT_RISK })
      await expectListed(failed.id, { status: 'failed', ...STREAK_AT_RISK })
    })

    it('lists a care reminder with no text until it is queued, then with the queued text once retried or failed', async () => {
      const pending = await seedUser()
      await seedCareRow(pending.id, new Date(Date.now() + 3_600_000))

      const queued = await seedUser()
      await seedCareRow(queued.id, new Date(Date.now() - 60_000))
      await enqueueDueFor(queued.id)

      const queueAndFail = async () => {
        const user = await seedUser()
        await seedCareRow(user.id, new Date(Date.now() - 60_000))
        await consumeFailing(await enqueueDueFor(user.id))
        return user
      }
      const retried = await queueAndFail()
      const failed = await queueAndFail()
      await failAgain(failed.id)
      await failAgain(failed.id)

      expect(await rowState(retried.id)).toEqual([
        { status: 'pending', retryCount: 1 },
      ])
      expect(await rowState(failed.id)).toEqual([
        { status: 'failed', retryCount: 3 },
      ])
      await expectListed(pending.id, {
        status: 'pending',
        title: null,
        body: null,
      })
      await expectListed(queued.id, { status: 'queued', ...fernThirsty('en') })
      await expectListed(retried.id, {
        status: 'pending',
        ...fernThirsty('en'),
      })
      await expectListed(failed.id, { status: 'failed', ...fernThirsty('en') })
    })

    describe('for a French recipient', () => {
      it('stores a pending row in French', async () => {
        const user = await seedUser('fr')
        const params = { streakCount: 7 }
        const french = buildSimpleContent('streak_milestone', params, 'fr')
        expect(french).not.toEqual(
          buildSimpleContent('streak_milestone', params, 'en')
        )

        await run(
          recordNotificationAt(
            'streak_milestone',
            user.id,
            params,
            'fr',
            {},
            {
              scheduledAt: new Date(Date.now() + 3_600_000),
            }
          )
        )

        await expectListed(user.id, { status: 'pending', ...french })
      })

      it('stores a queued row in French', async () => {
        const user = await seedUser('fr')
        const params = { streakCount: 5 }

        await run(
          recordNotification('streak_at_risk', user.id, params, 'fr', {})
        )

        await expectListed(user.id, {
          status: 'queued',
          ...buildSimpleContent('streak_at_risk', params, 'fr'),
        })
      })

      it('queues a care reminder in the language the recipient reads when it is queued', async () => {
        const user = await seedUser('en')
        await seedCareRow(user.id, new Date(Date.now() - 60_000))
        await db
          .update(schema.users)
          .set({ language: 'fr' })
          .where(eq(schema.users.id, user.id))
        expect(fernThirsty('fr')).not.toEqual(fernThirsty('en'))

        await enqueueDueFor(user.id)

        await expectListed(user.id, { status: 'queued', ...fernThirsty('fr') })
      })

      it('stores a follow row in the language of the followed user', async () => {
        const follower = await seedUser('en')
        const target = await seedUser('fr')
        const params = { senderName: follower.name ?? '' }
        const french = buildSimpleContent('new_follower', params, 'fr')
        expect(french).not.toEqual(
          buildSimpleContent('new_follower', params, 'en')
        )

        await run(
          followUser(target.id).pipe(
            Effect.provide(
              Layer.mergeAll(
                FollowRepositoryLive.pipe(Layer.provide(DatabaseLive)),
                createMockEventBus({ publishedEvents: [] }),
                createMockCurrentUser({
                  id: follower.id,
                  name: follower.name ?? '',
                }),
                capturing().queue
              )
            )
          )
        )

        await expectListed(target.id, { status: 'queued', ...french })
      })
    })

    describe('when the scheduler queues a group', () => {
      const retriedCareRow = async () => {
        const user = await seedUser('en')
        await seedCareRow(user.id, new Date(Date.now() - 60_000))
        await consumeFailing(await enqueueDueFor(user.id))
        await expectListed(user.id, {
          status: 'pending',
          ...fernThirsty('en'),
        })
        await makeDue(user.id)
        return user
      }

      it('re-queues a retried care reminder under the current plant name', async () => {
        const user = await retriedCareRow()
        await db
          .update(schema.plants)
          .set({ name: 'Ivy' })
          .where(eq(schema.plants.userId, user.id))

        await enqueueDueFor(user.id)

        await expectListed(user.id, {
          status: 'queued',
          ...thirsty('Ivy', 'en'),
        })
      })

      it('re-queues a retried care reminder in the language the recipient reads now', async () => {
        const user = await retriedCareRow()
        await db
          .update(schema.users)
          .set({ language: 'fr' })
          .where(eq(schema.users.id, user.id))

        await enqueueDueFor(user.id)

        await expectListed(user.id, { status: 'queued', ...fernThirsty('fr') })
      })

      it('queues each recipient of one poll in that recipient language', async () => {
        const english = await seedUser('en')
        const french = await seedUser('fr')
        await seedCareRow(english.id, new Date(Date.now() - 60_000))
        await seedCareRow(french.id, new Date(Date.now() - 60_000))
        const { enqueued, queue } = capturing()

        await run(pollAndEnqueue.pipe(Effect.provide(queue)))

        expect(
          Array.map(enqueued, (message) => message.payload.userId).sort()
        ).toEqual([english.id, french.id].sort())
        await expectListed(english.id, {
          status: 'queued',
          ...fernThirsty('en'),
        })
        await expectListed(french.id, {
          status: 'queued',
          ...fernThirsty('fr'),
        })
      })

      it('writes the care digest onto every row of a multi-plant group', async () => {
        const user = await seedUser('en')
        await seedCareRow(user.id, new Date(Date.now() - 60_000))
        await seedCareRow(user.id, new Date(Date.now() - 60_000))

        const message = await enqueueDueFor(user.id)

        expect(message.payload.notificationIds).toHaveLength(2)
        const rows = await db
          .select({
            title: schema.notifications.title,
            body: schema.notifications.body,
          })
          .from(schema.notifications)
          .where(eq(schema.notifications.userId, user.id))
        const [first, second] = rows
        expect(rows).toHaveLength(2)
        expect(first).toEqual({
          title: expect.any(String),
          body: expect.any(String),
        })
        expect(second).toEqual(first)
      })

      it('keeps the record-time text of a simple row queued after a language change', async () => {
        const user = await seedUser('en')
        const params = { streakCount: 7 }
        await run(
          recordNotificationAt(
            'streak_milestone',
            user.id,
            params,
            'en',
            {},
            {
              scheduledAt: new Date(Date.now() - 60_000),
            }
          )
        )
        await db
          .update(schema.users)
          .set({ language: 'fr' })
          .where(eq(schema.users.id, user.id))

        await enqueueDueFor(user.id)

        await expectListed(user.id, {
          status: 'queued',
          ...buildSimpleContent('streak_milestone', params, 'en'),
        })
      })
    })
  }
)
