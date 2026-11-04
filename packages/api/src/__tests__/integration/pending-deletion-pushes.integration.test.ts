import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
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
import { processMessage } from '@lily/api/services/notification-scheduler/worker'
import { checkAndCreateOverdueReminders } from '@lily/api/services/overdue-scheduler/scheduler'
import { reminderRecipients } from '@lily/api/services/plants/helpers/reminder-recipients'
import { deleteAccount } from '@lily/api/services/user/endpoints/delete-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type {
  LiveActivityPushMessage,
  PushMessage,
  QueueMessage,
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
      status: 'accepted' | 'active' = 'active'
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
        effect: Effect.Effect<A, E, Layer.Success<typeof PipelineLive>>
      ) =>
        Effect.runPromise(
          effect.pipe(
            Effect.provide(PipelineLive),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
      const deliver = async () => {
        for (const message of enqueued.splice(0)) {
          await run(processMessage(message))
        }
      }
      return { run, deliver, enqueued, pushes, liveActivities }
    }

    const markPendingDeletion = (
      run: ReturnType<typeof pipeline>['run'],
      userId: string
    ) =>
      run(
        Effect.flatMap(UserRepository, (repo) =>
          repo.updateStatus(userId, 'pending_deletion')
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

      await markPendingDeletion(run, user.id)
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

    it('sends an overdue reminder to the owner, not a caretaker an admin marked pending deletion', async () => {
      const owner = await insertUser('overdue-owner')
      const caretaker = await insertUser('overdue-caretaker')
      const plant = await insertPlant(owner.id, new Date(Date.now() - 2 * DAY))
      await delegate(owner.id, caretaker.id, plant.id)
      const { run } = pipeline(owner)

      await markPendingDeletion(run, caretaker.id)
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
              row ? reminderRecipients(row) : Effect.die('plant missing')
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

      await markPendingDeletion(run, followed.id)
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

    it('leaves an account an admin marked pending deletion out of every engagement audience', async () => {
      const active = await insertUser('active')
      const leaving = await insertUser('leaving')
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
      await markPendingDeletion(run, leaving.id)

      const audiences = await run(
        Effect.gen(function* () {
          const repo = yield* EngagementRepository
          const ids = (rows: ReadonlyArray<{ readonly id: string }>) =>
            rows.map((r) => r.id)
          return {
            tips: ids(yield* repo.getUsersWithTipsEnabled()),
            careReminders: ids(yield* repo.getUsersWithCareRemindersEnabled()),
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
    })
  }
)
