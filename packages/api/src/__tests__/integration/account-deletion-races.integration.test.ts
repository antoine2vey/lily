import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import {
  DelegationRepository,
  DelegationRepositoryLive,
} from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import {
  NotificationRepository,
  NotificationRepositoryLive,
} from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { pollAndTransition } from '@lily/api/services/delegation-scheduler/scheduler'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { deleteAccount } from '@lily/api/services/user/endpoints/delete-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  References,
} from 'effect'
import { SqlError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY = 86_400_000

const BaseLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  RoomRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const outcome = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) => {
      const error = Cause.squash(cause)
      if (error instanceof SqlError) return error.reason._tag
      return (error as { readonly _tag?: string })._tag ?? 'failed'
    },
  })

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Account deletion racing delegation changes - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    const as = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      runtime.runPromiseExit(
        effect.pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId, email: `${userId}@x.test` }),
              createMockMessageQueue(),
              createMockPushService(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof BaseLive>>
      )

    const insertUser = async (label: string) => {
      const tag = `${label}-${crypto.randomUUID()}`
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${tag}@example.com`,
          name: tag,
          emailVerified: true,
          timezone: 'UTC',
          careReminders: true,
          preferredNotificationTime: '09:00',
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      return user.id
    }

    const seed = async (
      status: 'accepted' | 'active',
      startDate: Date = new Date(Date.now() - DAY)
    ) => {
      const owner = await insertUser('owner')
      const caretaker = await insertUser('caretaker')
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId: owner,
          createdByUserId: owner,
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
        nextCareAt: new Date(Date.now() + 3 * DAY),
      })
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId: owner,
          caretakerId: caretaker,
          status,
          startDate,
          endDate: new Date(Date.now() + 7 * DAY),
        })
        .returning()
      if (!delegation) throw new Error('delegation insert returned nothing')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId: plant.id })
      const seeded = await as(owner, rescheduleReminders([plant.id]))
      if (Exit.isFailure(seeded)) throw new Error(Cause.pretty(seeded.cause))
      return {
        owner,
        caretaker,
        plantId: plant.id,
        delegationId: delegation.id,
      }
    }

    const state = async (delegationId: string, userId: string) => {
      const [delegation] = await db
        .select({ status: schema.careDelegations.status })
        .from(schema.careDelegations)
        .where(eq(schema.careDelegations.id, delegationId))
      const [user] = await db
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      const rows = await db
        .select({ type: schema.notifications.type })
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userId))
      return {
        delegation: delegation?.status,
        user: user?.status,
        rows: rows.map((r) => r.type),
      }
    }

    const settledOrWaitingOnLock = async (other: Promise<unknown>) => {
      let settled = false
      void other.then(() => {
        settled = true
      })
      for (let i = 0; i < 500 && !settled; i++) {
        const [row] = await db
          .execute<{ waiting: string }>(
            sql`SELECT count(*)::text AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
          )
          .then((r) => r.rows)
        if (Number(row?.waiting ?? 0) > 0) return
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }

    const deleteWhileOtherRuns = async (
      deleterId: string,
      other: () => Promise<Exit.Exit<unknown, unknown>>
    ) => {
      const reached = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()
      const deleting = as(
        deleterId,
        Effect.gen(function* () {
          const repo = yield* UserRepository
          return yield* deleteAccount().pipe(
            Effect.provideService(UserRepository, {
              ...repo,
              softDelete: (id: string) =>
                Deferred.succeed(reached, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.andThen(repo.softDelete(id))
                ),
            })
          )
        })
      )
      await Effect.runPromise(Deferred.await(reached))
      const otherExit = other()
      await settledOrWaitingOnLock(otherExit)
      Deferred.doneUnsafe(release, Exit.void)
      return {
        deleted: outcome(await deleting),
        other: outcome(await otherExit),
      }
    }

    it('rolls the whole deletion back when a later step fails', async () => {
      const { caretaker, delegationId } = await seed('active')
      await db.insert(schema.deviceTokens).values({
        token: `ExponentPushToken[${crypto.randomUUID()}]`,
        platform: 'ios',
        userId: caretaker,
      })
      const before = await state(delegationId, caretaker)

      const exit = await as(
        caretaker,
        Effect.gen(function* () {
          const repo = yield* NotificationRepository
          return yield* deleteAccount().pipe(
            Effect.provideService(NotificationRepository, {
              ...repo,
              deletePendingByUserIdAndTypes: () =>
                Effect.die('notification cleanup failed'),
            })
          )
        })
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(before).toEqual({
        delegation: 'active',
        user: 'active',
        rows: ['watering_reminder'],
      })
      expect(await state(delegationId, caretaker)).toEqual(before)
      expect(
        await db
          .select({ id: schema.deviceTokens.id })
          .from(schema.deviceTokens)
          .where(eq(schema.deviceTokens.userId, caretaker))
      ).toHaveLength(1)
    })

    it('waits for a cancel that already holds the delegation row before taking any reminder lock', async () => {
      const { owner, delegationId } = await seed('active')
      const reached = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()
      const canceling = as(
        owner,
        Effect.gen(function* () {
          const repo = yield* DelegationRepository
          return yield* cancelDelegation(delegationId).pipe(
            Effect.provideService(DelegationRepository, {
              ...repo,
              transitionStatus: (...args) =>
                repo
                  .transitionStatus(...args)
                  .pipe(
                    Effect.tap(() =>
                      Deferred.succeed(reached, undefined).pipe(
                        Effect.andThen(Deferred.await(release))
                      )
                    )
                  ),
            })
          )
        })
      )
      await Effect.runPromise(Deferred.await(reached))
      const deleting = as(owner, deleteAccount())
      await settledOrWaitingOnLock(deleting)
      Deferred.doneUnsafe(release, Exit.void)

      expect({
        canceled: outcome(await canceling),
        deleted: outcome(await deleting),
      }).toEqual({ canceled: 'ok', deleted: 'ok' })
      expect(await state(delegationId, owner)).toEqual({
        delegation: 'canceled',
        user: 'pending_deletion',
        rows: [],
      })
    })

    it('lets a caretaker delete their account while the owner cancels the delegation, without a deadlock', async () => {
      const { owner, caretaker, delegationId } = await seed('active')

      const result = await deleteWhileOtherRuns(caretaker, () =>
        as(owner, cancelDelegation(delegationId))
      )

      expect(result).toEqual({
        deleted: 'ok',
        other: 'DelegationInvalidStatusError',
      })
      expect(await state(delegationId, caretaker)).toEqual({
        delegation: 'canceled',
        user: 'pending_deletion',
        rows: [],
      })
      expect((await state(delegationId, owner)).rows).toEqual([
        'watering_reminder',
      ])
    })

    it('lets a caretaker delete their account while the delegation starts, holding every reminder lock it needs', async () => {
      const { owner, caretaker, delegationId } = await seed(
        'accepted',
        new Date(Date.now() - 1000)
      )

      const result = await deleteWhileOtherRuns(caretaker, () =>
        as(owner, pollAndTransition)
      )

      expect(result).toEqual({ deleted: 'ok', other: 'ok' })
      expect(await state(delegationId, caretaker)).toEqual({
        delegation: 'canceled',
        user: 'pending_deletion',
        rows: [],
      })
    })

    it('lets an owner delete their account while canceling the delegation in another request, without a deadlock', async () => {
      const { owner, caretaker, delegationId } = await seed('active')

      const result = await deleteWhileOtherRuns(owner, () =>
        as(owner, cancelDelegation(delegationId))
      )

      expect(result).toEqual({
        deleted: 'ok',
        other: 'DelegationInvalidStatusError',
      })
      expect(await state(delegationId, owner)).toEqual({
        delegation: 'canceled',
        user: 'pending_deletion',
        rows: [],
      })
      expect((await state(delegationId, caretaker)).rows).toEqual([])
    })
  }
)
