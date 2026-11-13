import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import { processMessage } from '@lily/api/services/notification-scheduler/worker'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  type PushMessage,
  PushService,
  type QueueMessage,
} from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const OtherRepositories = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive
)

type Hook = () => Promise<void>
const noop: Hook = async () => {}

const DELAYS = [0, 20, 40] as const
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const OLD_TEXT = {
  title: '💧 Your Oldname is thirsty',
  body: 'Time to give your Oldname a drink today.',
}
const NEW_TITLE = '💧 Your Newname is thirsty'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Queue-time care text against a concurrent delivery - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    })

    afterAll(async () => {
      await pool.end()
    })

    let seq = 0
    const seedCare = async () => {
      seq += 1
      const stamp = `qw-${Date.now()}-${seq}`
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
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId: user.id,
          createdByUserId: user.id,
          name: 'Oldname',
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
      const [row] = await db
        .insert(schema.notifications)
        .values({
          type: 'watering_reminder',
          scheduledAt: new Date(Date.now() - 60_000),
          userId: user.id,
          plantId: plant.id,
        })
        .returning()
      if (!row) throw new Error('notification insert returned nothing')
      const stale: QueueMessage = {
        id: crypto.randomUUID(),
        topic: 'watering_reminder',
        payload: {
          userId: user.id,
          notificationIds: [row.id],
          plantIds: [plant.id],
        },
        retryCount: 0,
        createdAt: new Date(),
        scheduledAt: new Date(Date.now() - 60_000),
      }
      return { plant, row, stale }
    }

    const rename = (plantId: string) =>
      db
        .update(schema.plants)
        .set({ name: 'Newname' })
        .where(eq(schema.plants.id, plantId))

    const rowOf = async (id: string) => {
      const [row] = await db
        .select({
          status: schema.notifications.status,
          title: schema.notifications.title,
          body: schema.notifications.body,
          deliveryMessageId: schema.notifications.deliveryMessageId,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.id, id))
      return row
    }

    const harness = (
      hooks: { before?: Hook; after?: Hook; onPush?: Hook } = {}
    ) => {
      const enqueued: QueueMessage[] = []
      const pushes: PushMessage[] = []
      const writes: Array<{ title: string; body: string }> = []
      const WrappedNotifications = Layer.effect(
        NotificationRepository,
        Effect.gen(function* () {
          const base = yield* NotificationRepository
          return {
            ...base,
            setQueuedContent: (
              ids: readonly string[],
              title: string,
              body: string
            ) =>
              Effect.promise(hooks.before ?? noop).pipe(
                Effect.andThen(Effect.sync(() => writes.push({ title, body }))),
                Effect.andThen(base.setQueuedContent(ids, title, body)),
                Effect.andThen(Effect.promise(hooks.after ?? noop))
              ),
          }
        })
      ).pipe(Layer.provide(NotificationRepositoryLive))
      const push = Layer.effect(
        PushService,
        Effect.gen(function* () {
          const base = yield* PushService
          return {
            ...base,
            sendBatch: (messages: PushMessage[]) =>
              Effect.promise(hooks.onPush ?? noop).pipe(
                Effect.andThen(base.sendBatch(messages))
              ),
          }
        })
      ).pipe(
        Layer.provide(
          createMockPushService({
            onSendBatch: (messages) => pushes.push(...messages),
          })
        )
      )
      const common = Layer.mergeAll(
        MockAlerterLive,
        createMockEventBus({ publishedEvents: [] }),
        createMockCurrentUser({ id: 'none', name: 'none' }),
        createMockMessageQueue({
          onEnqueue: (_topic, message) => enqueued.push(message),
        }),
        push
      )
      const schedulerLayer = Layer.mergeAll(
        WrappedNotifications,
        OtherRepositories,
        common
      ).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))
      const workerLayer = Layer.mergeAll(
        NotificationRepositoryLive,
        OtherRepositories,
        common
      ).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))
      const poll = () =>
        Effect.runPromise(
          pollAndEnqueue.pipe(
            Effect.provide(schedulerLayer),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
      const deliver = (message: QueueMessage) =>
        Effect.runPromise(
          processMessage(message).pipe(
            Effect.provide(workerLayer),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
      return { enqueued, pushes, writes, poll, deliver }
    }

    const expectSentOnceWithPushedText = async (
      rowId: string,
      pushes: ReadonlyArray<PushMessage>
    ) => {
      expect(pushes).toHaveLength(1)
      const [push] = pushes
      expect(await rowOf(rowId)).toMatchObject({
        status: 'sent',
        title: push?.title,
        body: push?.body,
      })
      return push
    }

    it('leaves the delivered text when the queue-time write lands after delivery', async () => {
      const { plant, row, stale } = await seedCare()
      const h = harness({
        before: async () => {
          await rename(plant.id)
          await h.deliver(stale)
        },
      })

      await h.poll()
      const afterLateWrite = await rowOf(row.id)
      for (const message of h.enqueued) await h.deliver(message)

      expect(h.writes).toEqual([OLD_TEXT])
      const push = await expectSentOnceWithPushedText(row.id, h.pushes)
      expect(push?.title).toBe(NEW_TITLE)
      expect(afterLateWrite).toMatchObject({ status: 'sent', title: NEW_TITLE })
    })

    it('overwrites a queue-time write that lands between the worker claim and the sent mark', async () => {
      const { plant, row, stale } = await seedCare()
      let reachPush = () => {}
      const pushReached = new Promise<void>((resolve) => {
        reachPush = resolve
      })
      let releasePush = () => {}
      const pushReleased = new Promise<void>((resolve) => {
        releasePush = resolve
      })
      let holdPush = false
      let worker: Promise<unknown> = Promise.resolve()
      let midFlight: Awaited<ReturnType<typeof rowOf>>
      const h = harness({
        before: async () => {
          await rename(plant.id)
          holdPush = true
          worker = h.deliver(stale)
          await pushReached
        },
        after: async () => {
          midFlight = await rowOf(row.id)
          releasePush()
          await worker
        },
        onPush: async () => {
          if (!holdPush) return
          holdPush = false
          reachPush()
          await pushReleased
        },
      })

      await h.poll()
      for (const message of h.enqueued) await h.deliver(message)

      expect(midFlight).toMatchObject({
        status: 'queued',
        title: OLD_TEXT.title,
        deliveryMessageId: stale.id,
      })
      const push = await expectSentOnceWithPushedText(row.id, h.pushes)
      expect(push?.title).toBe(NEW_TITLE)
    })

    it('keeps the pushed text on the row whatever order the write, the stale delivery and a rename land in', async () => {
      for (const writeDelay of DELAYS) {
        for (const deliverDelay of DELAYS) {
          for (const renameDelay of DELAYS) {
            const { plant, row, stale } = await seedCare()
            const h = harness({ before: () => sleep(writeDelay) })

            await Promise.all([
              h.poll(),
              sleep(deliverDelay).then(() => h.deliver(stale)),
              sleep(renameDelay).then(() => rename(plant.id)),
            ])
            for (const message of h.enqueued) await h.deliver(message)

            await expectSentOnceWithPushedText(row.id, h.pushes)
          }
        }
      }
    }, 60_000)
  }
)
