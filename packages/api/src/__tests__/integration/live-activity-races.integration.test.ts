import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import { processMessage } from '@lily/api/services/notification-scheduler/worker'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  type LiveActivityPushMessage,
  PushSendError,
  PushService,
  type QueueMessage,
} from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  ConfigProvider,
  Effect,
  Exit,
  Layer,
  References,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const ROUNDS = 12
const CONCURRENT_PUSHES = 3

const RepositoriesLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive
).pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        DATABASE_URL: process.env.DATABASE_URL_TEST,
      })
    )
  )
)

const pushServiceRecording = (
  sent: LiveActivityPushMessage[],
  failingTokens: ReadonlyArray<string>
) =>
  Layer.succeed(PushService, {
    sendBatch: (messages) =>
      Effect.succeed(
        Arr.map(messages, () => ({
          id: `ticket-${crypto.randomUUID()}`,
          status: 'ok' as const,
        }))
      ),
    sendLiveActivity: (message) =>
      Effect.gen(function* () {
        sent.push(message)
        yield* Effect.sleep('5 millis')
        if (Arr.contains(failingTokens, message.to)) {
          return yield* new PushSendError({ message: 'APNs 500' })
        }
        return { id: `apns-${crypto.randomUUID()}`, status: 'ok' as const }
      }),
  })

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Live Activity under concurrent care pushes - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let userId: string
    let plantId: string
    let devices: [string, string]

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      const stamp = Date.now()
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `la-race-${stamp}@example.com`,
          name: `la-race-${stamp}`,
          emailVerified: true,
          timezone: 'UTC',
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      userId = user.id
      const inserted = await db
        .insert(schema.deviceTokens)
        .values([
          {
            token: `ExponentPushToken[race-a-${stamp}]`,
            platform: 'ios',
            userId,
          },
          {
            token: `ExponentPushToken[race-b-${stamp}]`,
            platform: 'ios',
            userId,
          },
        ])
        .returning()
      const [a, b] = inserted
      if (!a || !b) throw new Error('device insert returned nothing')
      devices = [a.id, b.id]
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId,
          createdByUserId: userId,
          name: 'Monstera',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      plantId = plant.id
      await db.insert(schema.plantCareSchedules).values({
        plantId,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: new Date(stamp - 86_400_000),
      })
    })

    beforeEach(async () => {
      await db
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, userId))
      await db
        .delete(schema.activityPushTokens)
        .where(eq(schema.activityPushTokens.userId, userId))
    })

    afterAll(async () => {
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      await pool.end()
    })

    const seedTokens = async (withCard: ReadonlyArray<0 | 1>) => {
      await db.insert(schema.activityPushTokens).values([
        ...Arr.map(devices, (deviceTokenId, i) => ({
          userId,
          deviceTokenId,
          kind: 'start' as const,
          token: `start-${i}`,
        })),
        ...Arr.map(withCard, (i) => ({
          userId,
          deviceTokenId: devices[i],
          kind: 'update' as const,
          activityId: `activity-${i}-${crypto.randomUUID()}`,
          token: `update-${i}`,
        })),
      ])
    }

    // One queue message per care batch: each poll picks up the row inserted
    // just before it, so the messages are distinct, as the overdue digest
    // and the regular reminder are in production.
    const enqueueCarePushes = async (count: number) => {
      const enqueued: QueueMessage[] = []
      const QueueLive = createMockMessageQueue({
        onEnqueue: (_topic, message) => {
          enqueued.push(message)
        },
      })
      for (let i = 0; i < count; i++) {
        await db.insert(schema.notifications).values({
          type: 'watering_reminder',
          scheduledAt: new Date(Date.now() - 60_000),
          userId,
          plantId,
        })
        await Effect.runPromise(
          pollAndEnqueue.pipe(
            Effect.provide(Layer.mergeAll(RepositoriesLive, QueueLive)),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
      }
      expect(enqueued).toHaveLength(count)
      return enqueued
    }

    const deliverConcurrently = async (
      messages: ReadonlyArray<QueueMessage>,
      failingTokens: ReadonlyArray<string> = []
    ) => {
      const sent: LiveActivityPushMessage[] = []
      const exit = await Effect.runPromiseExit(
        Effect.all(Arr.map(messages, processMessage), {
          concurrency: 'unbounded',
          discard: true,
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              RepositoriesLive,
              MockAlerterLive,
              pushServiceRecording(sent, failingTokens)
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      const statuses = await db
        .select({ status: schema.notifications.status })
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userId))
      expect(Arr.map(statuses, (s) => s.status)).toEqual(
        Arr.makeBy(messages.length, () => 'sent')
      )
      return sent
    }

    const count = (
      sent: ReadonlyArray<LiveActivityPushMessage>,
      tag: LiveActivityPushMessage['_tag'],
      to: string
    ) => Arr.filter(sent, (m) => m._tag === tag && m.to === to).length

    it('starts each card-less device once across concurrent care pushes', async () => {
      for (let round = 1; round <= ROUNDS; round++) {
        await db
          .delete(schema.activityPushTokens)
          .where(eq(schema.activityPushTokens.userId, userId))
        await db
          .delete(schema.notifications)
          .where(eq(schema.notifications.userId, userId))
        await seedTokens([])
        const sent = await deliverConcurrently(
          await enqueueCarePushes(CONCURRENT_PUSHES)
        )
        expect(count(sent, 'LiveActivityStart', 'start-0')).toBe(1)
        expect(count(sent, 'LiveActivityStart', 'start-1')).toBe(1)
      }
    }, 120_000)

    it('updates the running card on every push and starts the other device once', async () => {
      for (let round = 1; round <= ROUNDS; round++) {
        await db
          .delete(schema.activityPushTokens)
          .where(eq(schema.activityPushTokens.userId, userId))
        await db
          .delete(schema.notifications)
          .where(eq(schema.notifications.userId, userId))
        await seedTokens([0])
        const sent = await deliverConcurrently(
          await enqueueCarePushes(CONCURRENT_PUSHES)
        )
        expect(count(sent, 'LiveActivityUpdate', 'update-0')).toBe(
          CONCURRENT_PUSHES
        )
        expect(count(sent, 'LiveActivityStart', 'start-0')).toBe(0)
        expect(count(sent, 'LiveActivityStart', 'start-1')).toBe(1)
      }
    }, 120_000)

    it('updates both running cards on every push and starts none', async () => {
      for (let round = 1; round <= ROUNDS; round++) {
        await db
          .delete(schema.activityPushTokens)
          .where(eq(schema.activityPushTokens.userId, userId))
        await db
          .delete(schema.notifications)
          .where(eq(schema.notifications.userId, userId))
        await seedTokens([0, 1])
        const sent = await deliverConcurrently(
          await enqueueCarePushes(CONCURRENT_PUSHES)
        )
        expect(count(sent, 'LiveActivityUpdate', 'update-0')).toBe(
          CONCURRENT_PUSHES
        )
        expect(count(sent, 'LiveActivityUpdate', 'update-1')).toBe(
          CONCURRENT_PUSHES
        )
        expect(count(sent, 'LiveActivityStart', 'start-0')).toBe(0)
        expect(count(sent, 'LiveActivityStart', 'start-1')).toBe(0)
      }
    }, 120_000)

    it.each([
      'new_follower',
      'nudge_to_water',
      'delegation_request',
      'streak_at_risk',
    ] as const)('makes no Live Activity call for a %s push', async (type) => {
      await seedTokens([0])
      await db.insert(schema.notifications).values({
        type,
        title: 'Hello',
        body: 'World',
        scheduledAt: new Date(Date.now() - 60_000),
        userId,
      })
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
      expect(enqueued).toHaveLength(1)
      const sent = await deliverConcurrently(enqueued)
      expect(sent).toEqual([])
    })

    it('refreshes only the caretaker’s cards for a delegated plant’s push', async () => {
      const day = 86_400_000
      const [caretaker] = await db
        .insert(schema.users)
        .values({
          email: `la-caretaker-${Date.now()}@example.com`,
          name: `la-caretaker-${Date.now()}`,
          emailVerified: true,
          timezone: 'UTC',
        })
        .returning()
      if (!caretaker) throw new Error('caretaker insert returned nothing')
      const [caretakerDevice] = await db
        .insert(schema.deviceTokens)
        .values({
          token: `ExponentPushToken[caretaker-${Date.now()}]`,
          platform: 'ios',
          userId: caretaker.id,
        })
        .returning()
      if (!caretakerDevice) throw new Error('device insert returned nothing')
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId: userId,
          caretakerId: caretaker.id,
          status: 'active',
          startDate: new Date(Date.now() - day),
          endDate: new Date(Date.now() + 7 * day),
        })
        .returning()
      if (!delegation) throw new Error('delegation insert returned nothing')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId })
      await seedTokens([0, 1])
      await db.insert(schema.activityPushTokens).values([
        {
          userId: caretaker.id,
          deviceTokenId: caretakerDevice.id,
          kind: 'start',
          token: 'caretaker-start',
        },
        {
          userId: caretaker.id,
          deviceTokenId: caretakerDevice.id,
          kind: 'update',
          activityId: `caretaker-${crypto.randomUUID()}`,
          token: 'caretaker-update',
        },
      ])
      await db.insert(schema.notifications).values({
        type: 'watering_reminder',
        scheduledAt: new Date(Date.now() - 60_000),
        userId: caretaker.id,
        plantId,
      })
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
      expect(Arr.map(enqueued, (m) => m.payload.userId)).toEqual([caretaker.id])
      const deliver = async () => {
        const sent: LiveActivityPushMessage[] = []
        await Effect.runPromise(
          processMessage(enqueued[0] as QueueMessage).pipe(
            Effect.provide(
              Layer.mergeAll(
                RepositoriesLive,
                MockAlerterLive,
                pushServiceRecording(sent, [])
              )
            ),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
        return Arr.map(sent, (m) => `${m._tag}:${m.to}`)
      }
      // The owner's devices stay untouched whether or not the caretaker's
      // card lists the delegated plant.
      const delegatedOnly = await deliver()
      expect(
        Arr.filter(
          delegatedOnly,
          (m) => m !== 'LiveActivityUpdate:caretaker-update'
        )
      ).toEqual([])

      const [ownPlant] = await db
        .insert(schema.plants)
        .values({
          userId: caretaker.id,
          createdByUserId: caretaker.id,
          name: 'Pothos',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!ownPlant) throw new Error('plant insert returned nothing')
      await db.insert(schema.plantCareSchedules).values({
        plantId: ownPlant.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: new Date(Date.now() - day),
      })
      await db
        .update(schema.notifications)
        .set({ status: 'queued' })
        .where(eq(schema.notifications.userId, caretaker.id))
      const withOwnPlant = await deliver()
      expect(withOwnPlant).toEqual(['LiveActivityUpdate:caretaker-update'])
      await db
        .delete(schema.careDelegations)
        .where(eq(schema.careDelegations.id, delegation.id))
    })

    it('still updates the second card and marks the push sent when the first card fails', async () => {
      await seedTokens([0, 1])
      const sent = await deliverConcurrently(await enqueueCarePushes(1), [
        'update-0',
      ])
      expect(count(sent, 'LiveActivityUpdate', 'update-1')).toBe(1)
      expect(count(sent, 'LiveActivityStart', 'start-0')).toBe(0)
      expect(count(sent, 'LiveActivityStart', 'start-1')).toBe(0)
    })
  }
)
