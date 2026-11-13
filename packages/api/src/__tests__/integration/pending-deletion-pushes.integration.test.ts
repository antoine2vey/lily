import { returnFromVacation } from '@lily/api/__tests__/integration/absence-layers'
import {
  delivered,
  settled,
} from '@lily/api/__tests__/integration/canopy-layers'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockDeadLetterRepository } from '@lily/api/__tests__/mocks/dead-letter.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createInMemoryRedisQueue } from '@lily/api/__tests__/mocks/redis-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import type { Absence } from '@lily/api/contexts/absence'
import type { Canopy } from '@lily/api/contexts/canopy'
import { CareReadsLive } from '@lily/api/contexts/care'
import { Dirty, Reminders, replan } from '@lily/api/contexts/reminders'
import type { Outbox } from '@lily/api/kernel/outbox'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import {
  EngagementRepository,
  EngagementRepositoryLive,
} from '@lily/api/repositories/engagement.repository'
import {
  FollowRepository,
  FollowRepositoryLive,
} from '@lily/api/repositories/follow.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { dispatchNow } from '@lily/api/services/helpers/schedule-notification'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import { consumeNext } from '@lily/api/services/notification-scheduler/worker'
import { checkAndCreateOverdueReminders } from '@lily/api/services/overdue-scheduler/scheduler'
import { deleteAccount } from '@lily/api/services/user/endpoints/delete-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  type LiveActivityPushMessage,
  MessageQueue,
  type PushMessage,
  type QueueMessage,
} from '@lily/shared/server'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY = 86_400_000

const RepositoriesLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  EngagementRepositoryLive,
  FollowRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  SubscriptionRepositoryLive,
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

    const insertUser = async (label: string) => {
      const tag = `${label}-${crypto.randomUUID()}`
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${tag}@example.com`,
          name: tag,
          emailVerified: true,
          timezone: 'UTC',
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      return user
    }

    const insertDevice = async (userId: string) => {
      const [device] = await db
        .insert(schema.deviceTokens)
        .values({
          token: `ExponentPushToken[${crypto.randomUUID()}]`,
          platform: 'ios',
          userId,
        })
        .returning()
      if (!device) throw new Error('device token insert returned nothing')
      return device
    }

    const insertPlant = async (
      ownerId: string,
      nextCareAt: Date,
      dateAdded = new Date()
    ) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId: ownerId,
          createdByUserId: ownerId,
          name: 'Monstera',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          dateAdded,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      await db.insert(schema.plantCareSchedules).values({
        plantId: plant.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt,
      })
      return plant
    }

    const delegate = async (
      ownerId: string,
      caretakerId: string,
      plantId: string,
      status: 'pending' | 'accepted' | 'active' | 'completed' = 'active'
    ) => {
      const now = Date.now()
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId,
          caretakerId,
          status,
          startDate: new Date(now - DAY),
          endDate: new Date(now + 7 * DAY),
        })
        .returning()
      if (!delegation) throw new Error('delegation insert returned nothing')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId })
      return delegation
    }

    const insertReminder = async (
      userId: string,
      plantId: string,
      scheduledAt: Date
    ) => {
      const [reminder] = await db
        .insert(schema.notifications)
        .values({ type: 'watering_reminder', scheduledAt, userId, plantId })
        .returning()
      if (!reminder) throw new Error('notification insert returned nothing')
      return reminder
    }

    const rowsOf = (userId: string) =>
      db
        .select({
          id: schema.notifications.id,
          type: schema.notifications.type,
          status: schema.notifications.status,
          plantId: schema.notifications.plantId,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userId))

    const delegationStatus = async (id: string) => {
      const [row] = await db
        .select({ status: schema.careDelegations.status })
        .from(schema.careDelegations)
        .where(eq(schema.careDelegations.id, id))
      return row?.status
    }

    const pipeline = (actor: { id: string; email: string }) => {
      const enqueued: QueueMessage[] = []
      const pushes: PushMessage[] = []
      const liveActivities: LiveActivityPushMessage[] = []
      const PipelineLive = Layer.mergeAll(
        RepositoriesLive,
        MockAlerterLive,
        createMockEventBus(),
        createMockLimitChecker(),
        createMockWeatherProvider(),
        createMockWeatherCache(),
        createMockWeatherRepository(),
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
        createMockCurrentUser({ id: actor.id, email: actor.email })
      )
      const run = <A, E>(
        effect: Effect.Effect<
          A,
          E,
          Layer.Success<typeof PipelineLive> | Outbox | Canopy | Absence
        >
      ) =>
        Effect.runPromise(
          effect.pipe(
            settled,
            Effect.provide(PipelineLive),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
      const deliver = async () => {
        const { queue } = createInMemoryRedisQueue(
          enqueued.splice(0).map((message) => JSON.stringify(message))
        )
        const deadLettered: unknown[] = []
        const consume = consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(MessageQueue, queue),
              createMockDeadLetterRepository({
                onCreate: (data) => deadLettered.push(data),
              })
            )
          )
        )
        while (await run(consume)) {}
        expect(deadLettered).toEqual([])
      }
      return { run, deliver, enqueued, pushes, liveActivities }
    }

    const markStatus = (
      run: ReturnType<typeof pipeline>['run'],
      userId: string,
      status: 'pending_deletion' | 'suspended' | 'banned'
    ) =>
      run(
        Effect.flatMap(UserRepository, (repo) =>
          repo.updateStatus(userId, status)
        )
      )

    it('deletes the pending rows and push tokens of the account, and sends nothing', async () => {
      const user = await insertUser('deleted')
      const device = await insertDevice(user.id)
      await db.insert(schema.activityPushTokens).values({
        userId: user.id,
        deviceTokenId: device.id,
        kind: 'start',
        token: `la-start-${crypto.randomUUID()}`,
      })
      const plant = await insertPlant(user.id, new Date(Date.now() - DAY))
      await insertReminder(user.id, plant.id, new Date(Date.now() - 60_000))
      await db.insert(schema.notifications).values({
        type: 'daily_tip',
        scheduledAt: new Date(Date.now() + DAY),
        userId: user.id,
      })
      const { run, deliver, enqueued, pushes, liveActivities } = pipeline(user)

      await run(deleteAccount())
      expect(await rowsOf(user.id)).toEqual([])

      await run(pollAndEnqueue)
      expect(enqueued).toEqual([])
      await deliver()
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

    it('drops at relay a row written for the account after it was deleted', async () => {
      const user = await insertUser('relay')
      const plant = await insertPlant(user.id, new Date(Date.now() - DAY))
      const { run, enqueued } = pipeline(user)

      await run(deleteAccount())
      await insertReminder(user.id, plant.id, new Date(Date.now() - 60_000))
      await run(pollAndEnqueue)

      expect(enqueued).toEqual([])
      expect(await rowsOf(user.id)).toEqual([])
    })

    it('drops at relay a tip for an account an admin marked pending deletion', async () => {
      const user = await insertUser('relay-tip')
      await db.insert(schema.notifications).values({
        type: 'daily_tip',
        scheduledAt: new Date(Date.now() - 60_000),
        userId: user.id,
      })
      const { run, enqueued } = pipeline(user)

      await markStatus(run, user.id, 'pending_deletion')
      await run(pollAndEnqueue)

      expect(enqueued).toEqual([])
      expect(await rowsOf(user.id)).toEqual([])
    })

    it('drops at delivery a row already queued when the account was deleted', async () => {
      const user = await insertUser('delivery')
      await insertDevice(user.id)
      const plant = await insertPlant(user.id, new Date(Date.now() - DAY))
      await insertReminder(user.id, plant.id, new Date(Date.now() - 60_000))
      const { run, deliver, enqueued, pushes } = pipeline(user)

      await run(pollAndEnqueue)
      expect(enqueued).toHaveLength(1)
      expect(await rowsOf(user.id)).toMatchObject([{ status: 'queued' }])
      await run(deleteAccount())
      await deliver()

      expect(pushes).toEqual([])
      expect(await rowsOf(user.id)).toEqual([])
    })

    it('moves the next reminder to the owner once the caretaker deletes their account', async () => {
      const owner = await insertUser('owner')
      const caretaker = await insertUser('caretaker')
      const plant = await insertPlant(owner.id, new Date(Date.now() + DAY))
      const delegation = await delegate(owner.id, caretaker.id, plant.id)
      await insertReminder(caretaker.id, plant.id, new Date(Date.now() + DAY))
      const { run } = pipeline(caretaker)

      await run(deleteAccount())

      expect(await delegationStatus(delegation.id)).toBe('canceled')
      expect(await rowsOf(caretaker.id)).toEqual([])
      expect(await rowsOf(owner.id)).toMatchObject([
        { type: 'watering_reminder', status: 'pending', plantId: plant.id },
      ])
    })

    it('gives the caretaker no further reminders once the owner deletes their account', async () => {
      const owner = await insertUser('owner')
      const caretaker = await insertUser('caretaker')
      const plant = await insertPlant(owner.id, new Date(Date.now() + DAY))
      const delegation = await delegate(owner.id, caretaker.id, plant.id)
      const nextWeek = await delegate(
        owner.id,
        caretaker.id,
        (await insertPlant(owner.id, new Date(Date.now() + DAY))).id,
        'accepted'
      )
      await insertReminder(caretaker.id, plant.id, new Date(Date.now() + DAY))
      const { run } = pipeline(owner)

      await run(deleteAccount())

      expect(await delegationStatus(delegation.id)).toBe('canceled')
      expect(await delegationStatus(nextWeek.id)).toBe('canceled')
      expect(await rowsOf(caretaker.id)).toEqual([])
      expect(await rowsOf(owner.id)).toEqual([])
    })

    it('cancels a pending delegation and leaves a completed one alone when the owner deletes their account', async () => {
      const owner = await insertUser('owner')
      const caretaker = await insertUser('caretaker')
      const plant = await insertPlant(owner.id, new Date(Date.now() + DAY))
      const pending = await delegate(
        owner.id,
        caretaker.id,
        plant.id,
        'pending'
      )
      const completed = await delegate(
        owner.id,
        caretaker.id,
        plant.id,
        'completed'
      )
      const { run } = pipeline(owner)

      await run(deleteAccount())

      expect(await delegationStatus(pending.id)).toBe('canceled')
      expect(await delegationStatus(completed.id)).toBe('completed')
    })

    it('lets a caretaker whose only delegation is accepted delete their account, leaving the owner reminders as they were', async () => {
      const owner = await insertUser('owner')
      const caretaker = await insertUser('caretaker')
      const plant = await insertPlant(owner.id, new Date(Date.now() + DAY))
      const accepted = await delegate(
        owner.id,
        caretaker.id,
        plant.id,
        'accepted'
      )
      await insertReminder(owner.id, plant.id, new Date(Date.now() + DAY))
      const before = await rowsOf(owner.id)
      const { run } = pipeline(caretaker)

      const outcome = await run(deleteAccount()).then(
        () => 'deleted',
        (error: unknown) => String(error)
      )

      expect(outcome).toBe('deleted')

      expect(await delegationStatus(accepted.id)).toBe('canceled')
      expect(await rowsOf(owner.id)).toEqual(before)
    })

    it('writes no overdue reminder for an account pending deletion', async () => {
      const deleted = await insertUser('overdue-deleted')
      const active = await insertUser('overdue-active')
      await insertPlant(deleted.id, new Date(Date.now() - 2 * DAY))
      const activePlant = await insertPlant(
        active.id,
        new Date(Date.now() - 2 * DAY)
      )
      const { run } = pipeline(deleted)

      await run(deleteAccount())
      await run(checkAndCreateOverdueReminders)

      expect(await rowsOf(deleted.id)).toEqual([])
      expect(await rowsOf(active.id)).toMatchObject([
        { type: 'overdue_reminder', plantId: activePlant.id },
      ])
    })

    it('reminds the owner of an overdue plant whose creator is gone', async () => {
      const owner = await insertUser('overdue-orphan')
      const plant = await insertPlant(owner.id, new Date(Date.now() - 2 * DAY))
      await db
        .update(schema.plants)
        .set({ createdByUserId: null })
        .where(eq(schema.plants.id, plant.id))
      const { run } = pipeline(owner)

      await run(checkAndCreateOverdueReminders)

      expect(await rowsOf(owner.id)).toMatchObject([
        { type: 'overdue_reminder', plantId: plant.id },
      ])
    })

    it('sends an overdue reminder to the owner, not a caretaker an admin marked pending deletion', async () => {
      const owner = await insertUser('overdue-owner')
      const caretaker = await insertUser('overdue-caretaker')
      const plant = await insertPlant(owner.id, new Date(Date.now() - 2 * DAY))
      await delegate(owner.id, caretaker.id, plant.id)
      const { run } = pipeline(owner)

      await markStatus(run, caretaker.id, 'pending_deletion')
      await run(checkAndCreateOverdueReminders)

      expect(await rowsOf(caretaker.id)).toEqual([])
      expect(await rowsOf(owner.id)).toMatchObject([
        { type: 'overdue_reminder', plantId: plant.id },
      ])
    })

    it('names the owner, not a caretaker pending deletion, as the reminder recipient', async () => {
      const owner = await insertUser('owner')
      const caretaker = await insertUser('caretaker')
      const plant = await insertPlant(owner.id, new Date(Date.now() + DAY))
      await delegate(owner.id, caretaker.id, plant.id)
      const { run } = pipeline(owner)
      const recipients = () =>
        run(
          Effect.flatMap(PlantRepository, (repo) =>
            repo.findById(plant.id)
          ).pipe(
            Effect.flatMap((row) =>
              row ? Reminders.audienceOf(row) : Effect.die('plant missing')
            )
          )
        )

      expect(await recipients()).toEqual([caretaker.id])
      await db
        .update(schema.users)
        .set({ status: 'pending_deletion', deletedAt: new Date() })
        .where(eq(schema.users.id, caretaker.id))
      expect(await recipients()).toEqual([owner.id])
    })

    it('takes the waiting reminders of a caretaker an admin marked pending deletion off the plants they tended, and gives them to the owner', async () => {
      const owner = await insertUser('owner')
      const caretaker = await insertUser('caretaker')
      const plant = await insertPlant(owner.id, new Date(Date.now() + DAY))
      await delegate(owner.id, caretaker.id, plant.id)
      const { run } = pipeline(owner)
      await run(replan(Dirty.Plants({ plantIds: [plant.id] })))
      expect(await rowsOf(caretaker.id)).toMatchObject([
        { type: 'watering_reminder', status: 'pending', plantId: plant.id },
      ])

      await markStatus(run, caretaker.id, 'pending_deletion')
      await run(replan(Dirty.Recipient({ userId: caretaker.id })))

      expect(await rowsOf(caretaker.id)).toEqual([])
      expect(await rowsOf(owner.id)).toMatchObject([
        { type: 'watering_reminder', status: 'pending', plantId: plant.id },
      ])
    })

    const follow = (
      run: ReturnType<typeof pipeline>['run'],
      followerId: string,
      followingId: string
    ) =>
      run(
        Effect.gen(function* () {
          const repo = yield* FollowRepository
          const metadata = { senderId: followerId }
          const id = yield* repo.follow(followerId, followingId, {
            title: 'New follower',
            body: 'Someone followed you',
            params: { senderName: 'Someone' },
            metadata,
          })
          yield* dispatchNow({
            id,
            type: 'new_follower',
            userId: followingId,
            metadata,
          })
        })
      )

    it('sends no new follower push to an account an admin marked pending deletion', async () => {
      const follower = await insertUser('follower')
      const followed = await insertUser('followed')
      await insertDevice(followed.id)
      const { run, deliver, pushes } = pipeline(followed)

      await markStatus(run, followed.id, 'pending_deletion')
      await follow(run, follower.id, followed.id)
      await deliver()

      expect(pushes).toEqual([])
      expect(await rowsOf(followed.id)).toEqual([])
    })

    it('still sends a new follower push from an account pending deletion', async () => {
      const follower = await insertUser('follower')
      const followed = await insertUser('followed')
      const device = await insertDevice(followed.id)
      const { run, deliver, pushes } = pipeline(follower)

      await run(deleteAccount())
      await follow(run, follower.id, followed.id)
      await deliver()

      expect(pushes).toMatchObject([{ to: device.token }])
      expect(await rowsOf(followed.id)).toMatchObject([
        { type: 'new_follower', status: 'sent' },
      ])
    })

    it.each(['pending_deletion', 'suspended', 'banned'] as const)(
      'leaves a %s account out of every engagement audience',
      async (status) => {
        const active = await insertUser('active')
        const leaving = await insertUser(status)
        const now = Date.now()
        const monthAgo = new Date(now)
        monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1)
        for (const user of [active, leaving]) {
          await db.insert(schema.userSubscriptions).values({
            userId: user.id,
            tier: 'paid',
            status: 'trialing',
            trialStartsAt: new Date(now - 6 * DAY),
            trialEndsAt: new Date(now + DAY),
            currentPeriodStart: new Date(now - 6 * DAY),
            currentPeriodEnd: new Date(now + DAY),
          })
          await insertPlant(user.id, new Date(now + DAY), monthAgo)
        }
        const { run } = pipeline(active)
        await markStatus(run, leaving.id, status)

        const audiences = await run(
          Effect.gen(function* () {
            const repo = yield* EngagementRepository
            const ids = (rows: ReadonlyArray<{ readonly id: string }>) =>
              rows.map((r) => r.id)
            return {
              tips: ids(yield* repo.getUsersWithTipsEnabled()),
              careReminders: ids(
                yield* repo.getUsersWithCareRemindersEnabled()
              ),
              weeklyDigest: ids(yield* repo.getUsersWithWeeklyDigestEnabled()),
              trialEnding: ids(
                yield* repo.getTrialingUsersWithTrialEndingSoon(1)
              ),
              anniversaries: (yield* repo.getPlantsWithAnniversary([1])).map(
                (p) => p.userId
              ),
            }
          })
        )

        for (const [audience, ids] of Object.entries(audiences)) {
          expect({ audience, active: ids.includes(active.id) }).toEqual({
            audience,
            active: true,
          })
          expect({ audience, leaving: ids.includes(leaving.id) }).toEqual({
            audience,
            leaving: false,
          })
        }
      }
    )

    const LOCKED = ['suspended', 'banned'] as const

    it.each(LOCKED)(
      'drops at relay a reminder due for a %s account and pushes nothing',
      async (status) => {
        const user = await insertUser(`relay-${status}`)
        const device = await insertDevice(user.id)
        const plant = await insertPlant(user.id, new Date(Date.now() - DAY))
        await insertReminder(user.id, plant.id, new Date(Date.now() - 60_000))
        const { run, deliver, enqueued, pushes } = pipeline(user)

        await markStatus(run, user.id, status)
        await run(pollAndEnqueue)
        expect(enqueued.filter((m) => m.payload.userId === user.id)).toEqual([])
        await deliver()

        expect(pushes.filter((p) => p.to === device.token)).toEqual([])
        expect(await rowsOf(user.id)).toEqual([])
      }
    )

    it.each(LOCKED)(
      'drops at delivery a reminder queued before the account was %s',
      async (status) => {
        const user = await insertUser(`delivery-${status}`)
        await insertDevice(user.id)
        const plant = await insertPlant(user.id, new Date(Date.now() - DAY))
        await insertReminder(user.id, plant.id, new Date(Date.now() - 60_000))
        const { run, deliver, enqueued, pushes } = pipeline(user)

        await run(pollAndEnqueue)
        expect(enqueued).toHaveLength(1)
        await markStatus(run, user.id, status)
        await deliver()

        expect(pushes).toEqual([])
        expect(await rowsOf(user.id)).toEqual([])
      }
    )

    it.each(LOCKED)(
      'names the owner, not a %s caretaker, as the reminder recipient and keeps the delegation',
      async (status) => {
        const owner = await insertUser('owner')
        const caretaker = await insertUser(`caretaker-${status}`)
        const plant = await insertPlant(owner.id, new Date(Date.now() + DAY))
        const delegation = await delegate(owner.id, caretaker.id, plant.id)
        await insertReminder(caretaker.id, plant.id, new Date(Date.now() + DAY))
        const { run } = pipeline(owner)
        const recipients = () =>
          run(
            Effect.flatMap(PlantRepository, (repo) =>
              repo.findById(plant.id)
            ).pipe(
              Effect.flatMap((row) =>
                row ? Reminders.audienceOf(row) : Effect.die('plant missing')
              )
            )
          )

        expect(await recipients()).toEqual([caretaker.id])
        await markStatus(run, caretaker.id, status)

        expect(await recipients()).toEqual([owner.id])
        expect(await delegationStatus(delegation.id)).toBe('active')
        expect(await rowsOf(caretaker.id)).toMatchObject([
          { type: 'watering_reminder', status: 'pending', plantId: plant.id },
        ])
      }
    )

    it.each(LOCKED)(
      'sends an overdue reminder to the owner, not a %s caretaker',
      async (status) => {
        const owner = await insertUser('overdue-owner')
        const caretaker = await insertUser(`overdue-caretaker-${status}`)
        const plant = await insertPlant(
          owner.id,
          new Date(Date.now() - 2 * DAY)
        )
        await delegate(owner.id, caretaker.id, plant.id)
        const { run } = pipeline(owner)

        await markStatus(run, caretaker.id, status)
        await run(checkAndCreateOverdueReminders)

        expect(await rowsOf(caretaker.id)).toEqual([])
        expect(await rowsOf(owner.id)).toMatchObject([
          { type: 'overdue_reminder', plantId: plant.id },
        ])
      }
    )

    it.each(['pending_deletion', ...LOCKED] as const)(
      'shifts the schedule of a plant with a %s caretaker when its owner ends a vacation',
      async (status) => {
        const owner = await insertUser('vacation-owner')
        const caretaker = await insertUser(`vacation-caretaker-${status}`)
        const plant = await insertPlant(
          owner.id,
          new Date(Date.now() - 2 * DAY)
        )
        await delegate(owner.id, caretaker.id, plant.id)
        const [vacationer] = await db
          .update(schema.users)
          .set({
            vacationStatus: 'active',
            vacationStart: new Date(Date.now() - 5 * DAY),
            vacationEnd: new Date(Date.now() + DAY),
          })
          .where(eq(schema.users.id, owner.id))
          .returning()
        if (!vacationer) throw new Error('vacation update returned nothing')
        const { run } = pipeline(owner)

        await markStatus(run, caretaker.id, status)
        await run(delivered(returnFromVacation(vacationer.id)))

        const [schedule] = await db
          .select({ nextCareAt: schema.plantCareSchedules.nextCareAt })
          .from(schema.plantCareSchedules)
          .where(eq(schema.plantCareSchedules.plantId, plant.id))
        expect(schedule?.nextCareAt?.getTime()).toBeGreaterThan(Date.now())
      }
    )

    it.each(['pending_deletion', ...LOCKED] as const)(
      'writes no overdue reminder for a %s owner, even through a caretaker with the same status',
      async (status) => {
        const locked = await insertUser(`overdue-${status}`)
        const caretaker = await insertUser(`overdue-caretaker-${status}`)
        const active = await insertUser('overdue-active')
        await insertPlant(locked.id, new Date(Date.now() - 2 * DAY))
        const delegated = await insertPlant(
          locked.id,
          new Date(Date.now() - 2 * DAY)
        )
        await delegate(locked.id, caretaker.id, delegated.id)
        const activePlant = await insertPlant(
          active.id,
          new Date(Date.now() - 2 * DAY)
        )
        const { run } = pipeline(active)

        await markStatus(run, locked.id, status)
        await markStatus(run, caretaker.id, status)
        await run(checkAndCreateOverdueReminders)

        expect(await rowsOf(locked.id)).toEqual([])
        expect(await rowsOf(caretaker.id)).toEqual([])
        expect(await rowsOf(active.id)).toMatchObject([
          { type: 'overdue_reminder', plantId: activePlant.id },
        ])
      }
    )

    it.each(['pending_deletion', ...LOCKED] as const)(
      'sends an overdue reminder to the active caretaker of a %s owner',
      async (status) => {
        const owner = await insertUser(`overdue-owner-${status}`)
        const caretaker = await insertUser('overdue-caretaker')
        const plant = await insertPlant(
          owner.id,
          new Date(Date.now() - 2 * DAY)
        )
        await delegate(owner.id, caretaker.id, plant.id)
        const { run } = pipeline(caretaker)

        await markStatus(run, owner.id, status)
        await run(checkAndCreateOverdueReminders)

        expect(await rowsOf(owner.id)).toEqual([])
        expect(await rowsOf(caretaker.id)).toMatchObject([
          { type: 'overdue_reminder', plantId: plant.id },
        ])
      }
    )

    it.each(LOCKED)(
      'writes no overdue reminder for a %s Canopy member',
      async (status) => {
        const active = await insertUser('canopy-active')
        const locked = await insertUser(`canopy-${status}`)
        const [canopy] = await db
          .insert(schema.canopies)
          .values({ name: 'Flat', timezone: 'UTC' })
          .returning()
        if (!canopy) throw new Error('canopy insert returned nothing')
        await db.insert(schema.canopyMembers).values([
          { canopyId: canopy.id, userId: active.id, role: 'owner' },
          { canopyId: canopy.id, userId: locked.id, role: 'member' },
        ])
        const [plant] = await db
          .insert(schema.plants)
          .values({
            canopyId: canopy.id,
            createdByUserId: active.id,
            name: 'Shared Fern',
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
          nextCareAt: new Date(Date.now() - 2 * DAY),
        })
        const { run } = pipeline(active)

        await markStatus(run, locked.id, status)
        await run(checkAndCreateOverdueReminders)

        expect(await rowsOf(locked.id)).toEqual([])
        expect(await rowsOf(active.id)).toMatchObject([
          { type: 'overdue_reminder', plantId: plant.id },
        ])
      }
    )
  }
)
