import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import {
  createMockAlerter,
  MockAlerterLive,
} from '@lily/api/__tests__/mocks/alerter'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createInMemoryRedisQueue } from '@lily/api/__tests__/mocks/redis-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import {
  dispatchNow,
  recordNotification,
  recordNotificationAt,
} from '@lily/api/services/helpers/schedule-notification'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import {
  consumeNext,
  processMessage,
} from '@lily/api/services/notification-scheduler/worker'
import { getNotifications } from '@lily/api/services/notifications/endpoints/get-notifications'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { NotificationsListResponse } from '@lily/shared/notification'
import {
  MessageQueue,
  type PushMessage,
  type QueueMessage,
} from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Exit, Layer, Logger, References, Schema } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Notification content rendered at delivery - Integration',
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

    const seedUser = async (label: string) => {
      const stamp = `${label}-${Date.now()}`
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${stamp}@example.com`,
          name: stamp,
          emailVerified: true,
          timezone: 'UTC',
          language: 'en',
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

    const pipeline = () => {
      const enqueued: QueueMessage[] = []
      const pushes: PushMessage[] = []
      const warnings: unknown[] = []
      const layer = Layer.mergeAll(
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
        }),
        Logger.layer([
          Logger.make(({ logLevel, message }) => {
            if (logLevel === 'Warn') warnings.push(message)
          }),
        ])
      )
      const run = <A, E>(
        effect: Effect.Effect<A, E, Layer.Success<typeof layer>>
      ) => Effect.runPromise(effect.pipe(Effect.provide(layer)))
      return { enqueued, pushes, warnings, run }
    }

    const storedRow = async (id: string) => {
      const [row] = await db
        .select({
          status: schema.notifications.status,
          title: schema.notifications.title,
          body: schema.notifications.body,
          params: schema.notifications.params,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.id, id))
      return row
    }

    it('pushes a row recorded in English in the language the user switched to', async () => {
      const user = await seedUser('switch')
      const { enqueued, pushes, run } = pipeline()

      const recorded = await run(
        recordNotification(
          'streak_at_risk',
          user.id,
          { streakCount: 12, plantName: 'Monstera' },
          'en',
          {}
        )
      )
      expect(await storedRow(recorded.id)).toEqual({
        status: 'queued',
        title: "🔥 Don't lose your 12-day streak!",
        body: 'Your Monstera still needs care today. Keep the streak alive!',
        params: { streakCount: 12, plantName: 'Monstera' },
      })

      await run(dispatchNow(recorded))
      await db
        .update(schema.users)
        .set({ language: 'fr' })
        .where(eq(schema.users.id, user.id))
      for (const message of enqueued) {
        await run(processMessage(message))
      }

      const french = {
        title: '🔥 Ne perds pas ta série de 12 jours !',
        body: "Ta Monstera a encore besoin de soins aujourd'hui. Garde le rythme !",
      }
      expect(Array.map(pushes, ({ title, body }) => ({ title, body }))).toEqual(
        [french]
      )
      expect(await storedRow(recorded.id)).toEqual({
        status: 'sent',
        ...french,
        params: { streakCount: 12, plantName: 'Monstera' },
      })
    })

    it('lists a pending row with the text it was recorded with', async () => {
      const user = await seedUser('inbox')
      const { enqueued, run } = pipeline()
      const layer = Layer.mergeAll(
        RepositoriesLive,
        createMockEventBus({ publishedEvents: [] }),
        createMockCurrentUser({ id: user.id, name: user.name ?? '' })
      )
      const inbox = (status: 'all' | 'pending' | 'sent') =>
        Effect.runPromise(
          getNotifications({ status }).pipe(
            Effect.flatMap(
              Schema.encodeUnknownEffect(NotificationsListResponse)
            ),
            Effect.provide(layer)
          )
        )

      await run(
        recordNotificationAt(
          'streak_milestone',
          user.id,
          { streakCount: 7 },
          'en',
          {},
          { scheduledAt: new Date(Date.now() + 3_600_000) }
        )
      )
      const sent = await run(
        recordNotification(
          'streak_at_risk',
          user.id,
          { streakCount: 5 },
          'en',
          {}
        )
      )
      await run(dispatchNow(sent))
      for (const message of enqueued) {
        await run(processMessage(message))
      }

      const milestone = buildSimpleContent(
        'streak_milestone',
        { streakCount: 7 },
        'en'
      )
      const atRisk = buildSimpleContent(
        'streak_at_risk',
        { streakCount: 5 },
        'en'
      )
      const listed = (items: ReadonlyArray<object>) =>
        Array.map(items, (item) => ({
          ...item,
          hasParams: Object.hasOwn(item, 'params'),
        }))
      expect(listed((await inbox('pending')).items)).toEqual([
        expect.objectContaining({
          type: 'streak_milestone',
          status: 'pending',
          ...milestone,
          hasParams: false,
        }),
      ])
      expect(listed((await inbox('all')).items)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'pending', ...milestone }),
          expect.objectContaining({
            status: 'sent',
            ...atRisk,
            hasParams: false,
          }),
        ])
      )
    })

    describe('when a row cannot be rendered', () => {
      const PII = 'Zelda-Private-Name'

      const seedPlant = async (userId: string, name: string) => {
        const [plant] = await db
          .insert(schema.plants)
          .values({
            userId,
            createdByUserId: userId,
            name,
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
        return plant
      }

      const seedDueReminder = (userId: string, plantId?: string) =>
        db.insert(schema.notifications).values({
          type: 'watering_reminder',
          scheduledAt: new Date(Date.now() - 60_000),
          userId,
          ...(plantId === undefined ? {} : { plantId }),
        })

      const enqueueDue = async () => {
        const enqueued: QueueMessage[] = []
        await Effect.runPromise(
          pollAndEnqueue.pipe(
            Effect.provide(
              Layer.mergeAll(
                RepositoriesLive,
                createMockMessageQueue({
                  onEnqueue: (_topic, message) => {
                    enqueued.push(message)
                  },
                })
              )
            ),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
        return enqueued
      }

      const consume = async (
        message: unknown,
        { pushFails = false }: { pushFails?: boolean } = {}
      ) => {
        const { queue } = createInMemoryRedisQueue([JSON.stringify(message)])
        const pushes: PushMessage[] = []
        const logs: unknown[] = []
        const alerter = createMockAlerter()
        const exit = await Effect.runPromiseExit(
          consumeNext.pipe(
            Effect.provide(
              Layer.mergeAll(
                RepositoriesLive,
                DeadLetterRepositoryLive.pipe(Layer.provide(RepositoriesLive)),
                Layer.succeed(MessageQueue, queue),
                alerter.layer,
                createMockPushService({
                  onSendBatch: (messages) => {
                    pushes.push(...messages)
                  },
                  shouldFail: pushFails,
                  failureMessage: 'push down',
                }),
                createMockActivityPushTokenRepository(),
                createMockCareLogRepository([]),
                Logger.layer([
                  Logger.make(({ logLevel, message: logged }) => {
                    logs.push({ logLevel, message: logged })
                  }),
                ])
              )
            )
          )
        )
        return { exit, pushes, logs: JSON.stringify(logs) }
      }

      const rowsOf = (userId: string) =>
        db
          .select({
            status: schema.notifications.status,
            title: schema.notifications.title,
            body: schema.notifications.body,
            retryCount: schema.notifications.retryCount,
          })
          .from(schema.notifications)
          .where(eq(schema.notifications.userId, userId))

      const deadLetters = (userId: string) =>
        db
          .select()
          .from(schema.deadLetterMessages)
          .where(eq(schema.deadLetterMessages.userId, userId))

      const makeDue = (userId: string) =>
        db
          .update(schema.notifications)
          .set({ scheduledAt: new Date(Date.now() - 1000) })
          .where(eq(schema.notifications.userId, userId))

      it('sends the stored text of a row whose params fail to decode, logging only ids', async () => {
        const user = await seedUser('malformed')
        const [row] = await db
          .insert(schema.notifications)
          .values({
            type: 'canopy_member_joined',
            title: `${PII} joined`,
            body: `${PII} joined your canopy`,
            params: { senderName: PII, canopyName: 42 },
            scheduledAt: new Date(Date.now() - 60_000),
            userId: user.id,
          })
          .returning()
        if (!row) throw new Error('notification insert returned nothing')

        const [message] = await enqueueDue()
        const result = await consume(message)

        expect(Exit.isSuccess(result.exit)).toBe(true)
        expect(
          Array.map(result.pushes, ({ title, body }) => [title, body])
        ).toEqual([[`${PII} joined`, `${PII} joined your canopy`]])
        expect(await rowsOf(user.id)).toEqual([
          {
            status: 'sent',
            title: `${PII} joined`,
            body: `${PII} joined your canopy`,
            retryCount: 0,
          },
        ])
        expect(await deadLetters(user.id)).toEqual([])
        expect(result.logs).toContain(
          'Sending stored text - params did not render'
        )
        expect(result.logs).toContain(row.id)
        expect(result.logs).not.toContain(PII)
      })

      it('sends the stored text of a row whose count does not decode', async () => {
        const user = await seedUser('nan')
        const { enqueued, run } = pipeline()
        const recorded = await run(
          recordNotification(
            'streak_at_risk',
            user.id,
            { streakCount: Number.NaN },
            'en',
            {}
          )
        )
        await run(dispatchNow(recorded))
        const [stored] = await rowsOf(user.id)

        const result = await consume(enqueued[0])

        expect(Exit.isSuccess(result.exit)).toBe(true)
        expect(
          Array.map(result.pushes, ({ title, body }) => ({ title, body }))
        ).toEqual([{ title: stored?.title, body: stored?.body }])
        expect(await rowsOf(user.id)).toEqual([{ ...stored, status: 'sent' }])
      })

      it('deletes a care row that has no plant to name, with no push', async () => {
        const user = await seedUser('plantless')
        await seedDueReminder(user.id)

        const [message] = await enqueueDue()
        const result = await consume(message)

        expect(Exit.isSuccess(result.exit)).toBe(true)
        expect(result.pushes).toEqual([])
        expect(await rowsOf(user.id)).toEqual([])
      })

      for (const [label, kill] of [
        [
          'deleted',
          (plantId: string) =>
            db.delete(schema.plants).where(eq(schema.plants.id, plantId)),
        ],
        [
          'dead',
          (plantId: string) =>
            db
              .update(schema.plants)
              .set({ diedAt: new Date() })
              .where(eq(schema.plants.id, plantId)),
        ],
      ] as const) {
        it(`drops a care reminder whose plant is ${label} after enqueue, with no push and no retry`, async () => {
          const user = await seedUser(`plant-${label}`)
          const plant = await seedPlant(user.id, 'Fern')
          await seedDueReminder(user.id, plant.id)

          const [message] = await enqueueDue()
          await kill(plant.id)
          const result = await consume(message)

          expect(Exit.isSuccess(result.exit)).toBe(true)
          expect(result.pushes).toEqual([])
          expect(await rowsOf(user.id)).toEqual([])
        })
      }

      const seedDailyDueToday = async (userId: string) => {
        const plant = await seedPlant(userId, 'Daily')
        await db
          .update(schema.plantCareSchedules)
          .set({ frequencyDays: 1, nextCareAt: new Date() })
          .where(eq(schema.plantCareSchedules.plantId, plant.id))
        await db.insert(schema.notifications).values({
          type: 'watering_reminder',
          scheduledAt: new Date(Date.now() - 60_000),
          userId,
          plantId: plant.id,
          occasionDay: new Date().toISOString().slice(0, 10),
        })
        return plant
      }

      it('drops a queued reminder for today once a daily care moved the due day to tomorrow, with no push', async () => {
        const user = await seedUser('daily-cared')
        const plant = await seedDailyDueToday(user.id)

        const [message] = await enqueueDue()
        await db
          .update(schema.plantCareSchedules)
          .set({ nextCareAt: new Date(Date.now() + 86_400_000) })
          .where(eq(schema.plantCareSchedules.plantId, plant.id))
        const result = await consume(message)

        expect(Exit.isSuccess(result.exit)).toBe(true)
        expect(result.pushes).toEqual([])
        expect(await rowsOf(user.id)).toEqual([])
      })

      it('pushes a queued reminder for today while the daily care is still due today', async () => {
        const user = await seedUser('daily-due')
        await seedDailyDueToday(user.id)

        const [message] = await enqueueDue()
        const result = await consume(message)

        expect(Exit.isSuccess(result.exit)).toBe(true)
        expect(result.pushes).toHaveLength(1)
        expect(await rowsOf(user.id)).toMatchObject([{ status: 'sent' }])
      })

      it('renders a retried push on redelivery and dead-letters after the last attempt', async () => {
        const user = await seedUser('retry')
        const plant = await seedPlant(user.id, 'Oldname')
        await seedDueReminder(user.id, plant.id)
        const [first] = await enqueueDue()
        await consume(first, { pushFails: true })
        expect(await rowsOf(user.id)).toEqual([
          expect.objectContaining({ status: 'pending', retryCount: 1 }),
        ])

        await db
          .update(schema.plants)
          .set({ name: 'Newname' })
          .where(eq(schema.plants.id, plant.id))
        await makeDue(user.id)
        const [second] = await enqueueDue()
        const delivered = await consume(second)
        const [push] = delivered.pushes
        expect(push?.body).toContain('Newname')
        expect(await rowsOf(user.id)).toEqual([
          {
            status: 'sent',
            title: push?.title,
            body: push?.body,
            retryCount: 1,
          },
        ])

        const other = await seedUser('dead-letter')
        const otherPlant = await seedPlant(other.id, 'Fern')
        await seedDueReminder(other.id, otherPlant.id)
        for (let attempt = 1; attempt <= 3; attempt++) {
          await makeDue(other.id)
          const [message] = await enqueueDue()
          await consume(message, { pushFails: true })
        }
        expect(await rowsOf(other.id)).toEqual([
          expect.objectContaining({ status: 'failed', retryCount: 3 }),
        ])
        expect(await deadLetters(other.id)).toHaveLength(1)
      })

      it('renders an in-flight message that still carries title, body and language from the row', async () => {
        const user = await seedUser('inflight')
        const { enqueued, run } = pipeline()
        const recorded = await run(
          recordNotification(
            'streak_at_risk',
            user.id,
            { streakCount: 5 },
            'en',
            {}
          )
        )
        await run(dispatchNow(recorded))
        const [message] = enqueued
        if (!message) throw new Error('nothing enqueued')

        const result = await consume({
          ...message,
          payload: {
            ...message.payload,
            title: 'STALE title',
            body: 'STALE body',
            language: 'fr',
          },
        })

        expect(Array.map(result.pushes, ({ title }) => title)).toEqual([
          "🔥 Don't lose your 5-day streak!",
        ])
      })
    })
  }
)
