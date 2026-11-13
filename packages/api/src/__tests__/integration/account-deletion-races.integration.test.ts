import {
  absenceOverStore,
  leaveOnVacation,
  returnFromVacation,
  waitsForALock,
} from '@lily/api/__tests__/integration/absence-layers'
import { settled } from '@lily/api/__tests__/integration/canopy-layers'
import {
  careOverStore,
  waterAsCurrentUser,
} from '@lily/api/__tests__/integration/care-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import { replanPlants } from '@lily/api/contexts/reminders'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
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
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { withCarePlanStep } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { pollAndTransition } from '@lily/api/services/delegation-scheduler/scheduler'
import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import { deleteAccount } from '@lily/api/services/user/endpoints/delete-account'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array,
  Cause,
  Deferred,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Order,
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
  CareReadsLive,
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
          settled,
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId, email: `${userId}@x.test` }),
              createMockEventBus(),
              createMockLimitChecker(),
              createMockMessageQueue(),
              createMockPushService(),
              createMockRateLimiterService(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof BaseLive>>
      )

    const insertUser = async (label: string, id?: string) => {
      const tag = `${label}-${crypto.randomUUID()}`
      const [user] = await db
        .insert(schema.users)
        .values({
          id,
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
      const dueAt = new Date(Date.now() + 3 * DAY)
      await db.insert(schema.plantCareSchedules).values({
        plantId: plant.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueAt,
        dueDay: careDayOf(dueAt),
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
      const seeded = await as(owner, replanPlants([plant.id]))
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

    it('waits for a cancel that already holds the delegation row', async () => {
      const { owner, delegationId } = await seed('active')
      const reached = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()
      const canceling = as(
        owner,
        Effect.provide(
          cancelDelegation(delegationId),
          absenceOverStore((store) => ({
            ...store,
            apply: (writes) =>
              store
                .apply(writes)
                .pipe(
                  Effect.tap(() =>
                    Deferred.succeed(reached, undefined).pipe(
                      Effect.andThen(Deferred.await(release))
                    )
                  )
                ),
          }))
        )
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

    it('makes a vacation set behind a deletion wait for it, and puts no vacation on the deleted account', async () => {
      const userId = await insertUser('vacationer')
      const reached = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()
      const deleting = as(
        userId,
        Effect.gen(function* () {
          const repo = yield* UserRepository
          return yield* deleteAccount().pipe(
            Effect.provideService(UserRepository, {
              ...repo,
              softDelete: (id) =>
                repo
                  .softDelete(id)
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
      const setting = as(
        userId,
        leaveOnVacation(userId, {
          start: new Date(Date.now() - DAY),
          end: new Date(Date.now() + 7 * DAY),
        })
      )
      const setWaited = await waitsForALock(pool, setting)
      Deferred.doneUnsafe(release, Exit.void)

      expect({
        deleted: outcome(await deleting),
        set: outcome(await setting),
        setWaited,
      }).toEqual({ deleted: 'ok', set: 'UserNotFoundError', setWaited: true })
      expect(
        await db
          .select({
            status: schema.users.status,
            vacationStatus: schema.users.vacationStatus,
            vacationStart: schema.users.vacationStart,
            vacationEnd: schema.users.vacationEnd,
          })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
      ).toEqual([
        {
          status: 'pending_deletion',
          vacationStatus: 'none',
          vacationStart: null,
          vacationEnd: null,
        },
      ])
      expect(
        await db
          .select({ id: schema.outbox.id })
          .from(schema.outbox)
          .where(
            sql`${schema.outbox.topic} = 'absence' AND ${schema.outbox.event}->>'userId' = ${userId}`
          )
      ).toEqual([])
    })

    it('keeps the canceledAt of a cancel that commits while the deletion waits on the delegation row', async () => {
      const caretaker = await insertUser('caretaker')
      const owner = await insertUser('owner')
      const reached = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()
      const deleting = as(
        caretaker,
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
      // Created after the deletion locked the caretaker's delegations.
      const [created] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId: owner,
          caretakerId: caretaker,
          status: 'pending',
          startDate: new Date(Date.now() + DAY),
          endDate: new Date(Date.now() + 7 * DAY),
        })
        .returning()
      if (!created) throw new Error('delegation insert returned nothing')
      const canceledAt = new Date('2020-01-01T00:00:00.000Z')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          "UPDATE care_delegations SET status = 'canceled', canceled_at = $1 WHERE id = $2",
          [canceledAt, created.id]
        )
        Deferred.doneUnsafe(release, Exit.void)
        await settledOrWaitingOnLock(deleting)
        await client.query('COMMIT')
      } finally {
        client.release()
      }

      expect(outcome(await deleting)).toBe('ok')
      const [row] = await db
        .select({
          status: schema.careDelegations.status,
          canceledAt: schema.careDelegations.canceledAt,
        })
        .from(schema.careDelegations)
        .where(eq(schema.careDelegations.id, created.id))
      expect(row).toEqual({ status: 'canceled', canceledAt })
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

    it('lets a caretaker delete their account while the delegation starts', async () => {
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

    it.each([
      {
        deleter: 'caretaker',
        change: 'start',
        status: 'accepted',
        startsIn: -1000,
        endsIn: 7 * DAY,
        after: 'canceled',
      },
      {
        deleter: 'owner',
        change: 'end',
        status: 'active',
        startsIn: -7 * DAY,
        endsIn: -1000,
        after: 'completed',
      },
    ] as const)(
      'lets the $deleter delete their account while two of their delegations $change in one scheduler tick, the higher id first by every other column, without a deadlock',
      async ({ deleter, status, startsIn, endsIn, after }) => {
        const user = await insertUser(deleter)
        const uuid = crypto.randomUUID().slice(1)
        const [high, low] = [`f${uuid}`, `0${uuid}`]
        for (const id of [high, low]) {
          const other = await insertUser(
            'other',
            `${id === high ? '0' : 'f'}${crypto.randomUUID().slice(1)}`
          )
          const earlier = id === high ? -60_000 : 0
          const [owner, caretaker] =
            deleter === 'owner' ? [user, other] : [other, user]
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
          const dueAt = new Date(Date.now() + 3 * DAY)
          await db.insert(schema.plantCareSchedules).values({
            plantId: plant.id,
            careType: 'watering',
            frequencyDays: 7,
            nextCareAt: dueAt,
            dueDay: careDayOf(dueAt),
          })
          await db.insert(schema.careDelegations).values({
            id,
            ownerId: owner,
            caretakerId: caretaker,
            status,
            startDate: new Date(Date.now() + startsIn + earlier),
            endDate: new Date(Date.now() + endsIn + earlier),
          })
          await db
            .insert(schema.delegationPlants)
            .values({ delegationId: id, plantId: plant.id })
        }

        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        let calls = 0
        const transitioning = as(
          user,
          Effect.provide(
            pollAndTransition,
            absenceOverStore((store) => ({
              ...store,
              apply: (writes) =>
                store
                  .apply(writes)
                  .pipe(
                    Effect.tap(() =>
                      calls++ === 0
                        ? Deferred.succeed(reached, undefined).pipe(
                            Effect.andThen(Deferred.await(release))
                          )
                        : Effect.void
                    )
                  ),
            }))
          )
        )
        await Effect.runPromise(Deferred.await(reached))
        const deleting = as(user, deleteAccount())
        await settledOrWaitingOnLock(deleting)
        Deferred.doneUnsafe(release, Exit.void)

        expect({
          transitioned: outcome(await transitioning),
          deleted: outcome(await deleting),
        }).toEqual({ transitioned: 'ok', deleted: 'ok' })
        expect((await state(low, user)).delegation).toBe(after)
        expect([after, 'canceled']).toContain(
          (await state(high, user)).delegation
        )
        expect((await state(high, user)).user).toBe('pending_deletion')
      }
    )

    it('hard-deletes two accounts that share only finished delegations, one each way, at the same time without a deadlock', async () => {
      const a = await insertUser('purge-a')
      const b = await insertUser('purge-b')
      await db.insert(schema.careDelegations).values([
        {
          ownerId: a,
          caretakerId: b,
          status: 'completed',
          startDate: new Date(Date.now() - 9 * DAY),
          endDate: new Date(Date.now() - 2 * DAY),
        },
        {
          ownerId: b,
          caretakerId: a,
          status: 'canceled',
          startDate: new Date(Date.now() - 9 * DAY),
          endDate: new Date(Date.now() - 2 * DAY),
        },
      ])
      const hardDelete = (userId: string) => as(userId, purgeAccount(userId))

      // Slows each cascaded delegation delete so both cascades overlap.
      await db.execute(
        sql.raw(`
          CREATE FUNCTION slow_delegation_delete() RETURNS trigger AS $$
          BEGIN PERFORM pg_sleep(0.4); RETURN OLD; END $$ LANGUAGE plpgsql;
          CREATE TRIGGER slow_delegation_delete BEFORE DELETE ON care_delegations
            FOR EACH ROW EXECUTE FUNCTION slow_delegation_delete();
        `)
      )
      try {
        const purged = await Promise.all([hardDelete(a), hardDelete(b)])
        expect(purged.map(outcome)).toEqual(['ok', 'ok'])
      } finally {
        await db.execute(
          sql.raw(`
            DROP TRIGGER slow_delegation_delete ON care_delegations;
            DROP FUNCTION slow_delegation_delete();
          `)
        )
      }
      expect(
        await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(inArray(schema.users.id, [a, b]))
      ).toEqual([])
    })

    const deadlocks = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const [row] = await db
        .execute<{ deadlocks: string }>(
          sql`SELECT deadlocks::text AS deadlocks FROM pg_stat_database WHERE datname = current_database()`
        )
        .then((r) => r.rows)
      return Number(row?.deadlocks ?? 0)
    }

    const factsOf = (about: 'userId' | 'delegationId', id: string) =>
      db
        .execute<{ event: Record<string, unknown> }>(
          sql`SELECT event FROM outbox WHERE topic = 'absence' AND event->>${about} = ${id} ORDER BY id`
        )
        .then((r) => r.rows.map((row) => row.event))

    const accountOf = (userId: string) =>
      db
        .select({
          status: schema.users.status,
          vacation: schema.users.vacationStatus,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))

    const dueDayOf = (plantId: string) =>
      db
        .select({ nextCareAt: schema.plantCareSchedules.nextCareAt })
        .from(schema.plantCareSchedules)
        .where(eq(schema.plantCareSchedules.plantId, plantId))
        .then((rows) => rows[0]?.nextCareAt)

    const plantValues = {
      name: 'Fern',
      health: 'HEALTHY',
      humidityRating: 3,
      lightingRating: 3,
      petToxicityRating: 1,
      wateringRating: 3,
    } as const

    const away = async (userId: string) => {
      await db
        .update(schema.users)
        .set({
          vacationStatus: 'active',
          vacationStart: new Date(Date.now() - 3 * DAY),
          vacationEnd: new Date(Date.now() + 4 * DAY),
        })
        .where(eq(schema.users.id, userId))
    }

    const aCanopyMemberAwayWithATipWaitingOnACanopyPlant = async () => {
      const owner = await insertUser('canopy-owner')
      const member = await insertUser('canopy-member')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home', timezone: 'UTC' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      await db.insert(schema.canopyMembers).values([
        { canopyId: canopy.id, userId: owner, role: 'owner' },
        { canopyId: canopy.id, userId: member, role: 'member' },
      ])
      const [plant] = await db
        .insert(schema.plants)
        .values({ ...plantValues, canopyId: canopy.id, createdByUserId: owner })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      await db.insert(schema.notifications).values({
        type: 'photo_reminder',
        scheduledAt: new Date(Date.now() + DAY),
        userId: member,
        plantId: plant.id,
      })
      await away(member)
      return member
    }

    const pausedBefore = <A, E, R>(
      step: Effect.Effect<A, E, R>,
      reached: Deferred.Deferred<void>,
      release: Deferred.Deferred<void>
    ) =>
      Deferred.succeed(reached, undefined).pipe(
        Effect.andThen(Deferred.await(release)),
        Effect.andThen(step)
      )

    const changeHoldingTheAccountWhileItIsDeleted = async (
      member: string,
      change: (
        reached: Deferred.Deferred<void>,
        release: Deferred.Deferred<void>
      ) => Promise<Exit.Exit<unknown, unknown>>
    ) => {
      const before = await deadlocks()
      const reached = Deferred.makeUnsafe<void>()
      const release = Deferred.makeUnsafe<void>()
      const changing = change(reached, release)
      await Effect.runPromise(Deferred.await(reached))
      const deleting = as(member, deleteAccount())
      const deletionWaited = await waitsForALock(pool, deleting)
      Deferred.doneUnsafe(release, Exit.void)
      return {
        changed: outcome(await changing),
        deleted: outcome(await deleting),
        deletionWaited,
        deadlocks: (await deadlocks()) - before,
      }
    }

    const endingTheirVacation =
      (member: string) =>
      (reached: Deferred.Deferred<void>, release: Deferred.Deferred<void>) =>
        as(
          member,
          Effect.provide(
            returnFromVacation(member),
            absenceOverStore((store) => ({
              ...store,
              apply: (writes) =>
                pausedBefore(store.apply(writes), reached, release),
            }))
          )
        )

    const turningTipsOff =
      (member: string) =>
      (reached: Deferred.Deferred<void>, release: Deferred.Deferred<void>) =>
        as(
          member,
          Effect.gen(function* () {
            const repo = yield* NotificationRepository
            return yield* updateUserSettings({
              notifications: { tips: false },
            }).pipe(
              Effect.provideService(NotificationRepository, {
                ...repo,
                deletePendingByUserIdAndTypes: (userId, types) =>
                  pausedBefore(
                    repo.deletePendingByUserIdAndTypes(userId, types),
                    reached,
                    release
                  ),
              })
            )
          })
        )

    describe('a canopy member with a tip waiting on a canopy plant, deleting their account', () => {
      it('waits for a vacation end that already holds their account, without a deadlock', async () => {
        const member = await aCanopyMemberAwayWithATipWaitingOnACanopyPlant()

        const raced = await changeHoldingTheAccountWhileItIsDeleted(
          member,
          endingTheirVacation(member)
        )

        expect(raced).toEqual({
          changed: 'ok',
          deleted: 'ok',
          deletionWaited: true,
          deadlocks: 0,
        })
        expect(await accountOf(member)).toEqual([
          { status: 'pending_deletion', vacation: 'none' },
        ])
        expect(await factsOf('userId', member)).toMatchObject([
          { _tag: 'VacationEnded' },
        ])
      })

      it('makes a vacation end behind the deletion wait for it, without a deadlock, and ends the vacation once', async () => {
        const member = await aCanopyMemberAwayWithATipWaitingOnACanopyPlant()
        const before = await deadlocks()

        const raced = await deleteWhileOtherRuns(member, () =>
          as(member, returnFromVacation(member))
        )

        expect({ ...raced, deadlocks: (await deadlocks()) - before }).toEqual({
          deleted: 'ok',
          other: 'UserNotFoundError',
          deadlocks: 0,
        })
        expect(await accountOf(member)).toEqual([
          { status: 'pending_deletion', vacation: 'none' },
        ])
        expect(await factsOf('userId', member)).toMatchObject([
          { _tag: 'VacationEnded' },
        ])
      })

      it('waits for a settings change that turns tips off and already holds their account, without a deadlock', async () => {
        const member = await aCanopyMemberAwayWithATipWaitingOnACanopyPlant()

        const raced = await changeHoldingTheAccountWhileItIsDeleted(
          member,
          turningTipsOff(member)
        )

        expect(raced).toEqual({
          changed: 'ok',
          deleted: 'ok',
          deletionWaited: true,
          deadlocks: 0,
        })
        expect((await accountOf(member))[0]?.status).toBe('pending_deletion')
      })

      it('makes a settings change that turns tips off behind the deletion wait for it, without a deadlock', async () => {
        const member = await aCanopyMemberAwayWithATipWaitingOnACanopyPlant()
        const before = await deadlocks()

        const raced = await deleteWhileOtherRuns(member, () =>
          as(member, updateUserSettings({ notifications: { tips: false } }))
        )

        expect({ ...raced, deadlocks: (await deadlocks()) - before }).toEqual({
          deleted: 'ok',
          other: 'ok',
          deadlocks: 0,
        })
        expect((await accountOf(member))[0]?.status).toBe('pending_deletion')
      })
    })

    it('ends the vacation of an account that asks for its deletion, says so once, and moves no due day', async () => {
      const userId = await insertUser('away')
      const [plant] = await db
        .insert(schema.plants)
        .values({ ...plantValues, userId, createdByUserId: userId })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      const dueWhileAway = new Date(Date.now() - DAY)
      await db.insert(schema.plantCareSchedules).values({
        plantId: plant.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueWhileAway,
        dueDay: careDayOf(dueWhileAway),
      })
      await away(userId)

      expect(outcome(await as(userId, deleteAccount()))).toBe('ok')

      expect(await accountOf(userId)).toEqual([
        { status: 'pending_deletion', vacation: 'none' },
      ])
      expect(await factsOf('userId', userId)).toMatchObject([
        { _tag: 'VacationEnded' },
      ])
      expect(await dueDayOf(plant.id)).toEqual(dueWhileAway)
    })

    it('hard-deletes an account that is on vacation, and what it says about the vacation is heard without an error', async () => {
      const userId = await insertUser('away-for-good')
      await away(userId)

      expect(outcome(await as(userId, purgeAccount(userId)))).toBe('ok')

      expect(await accountOf(userId)).toEqual([])
      expect(
        await db
          .execute<{ fact: string; heard: boolean; error: string | null }>(
            sql`SELECT event->>'_tag' AS fact, processed_at IS NOT NULL AS heard, last_error AS error FROM outbox WHERE topic = 'absence' AND event->>'userId' = ${userId}`
          )
          .then((r) => r.rows)
      ).toEqual([{ fact: 'VacationEnded', heard: true, error: null }])
    })

    describe('the hard deletion of a caretaker who is tending plants', () => {
      const remindersOf = (userId: string, plantId: string) =>
        db
          .select({
            type: schema.notifications.type,
            status: schema.notifications.status,
          })
          .from(schema.notifications)
          .where(
            sql`${schema.notifications.userId} = ${userId} AND ${schema.notifications.plantId} = ${plantId}`
          )

      it('says the delegation ended because the account was deleted, and gives the coming reminders of its plants back to their owner', async () => {
        const { owner, caretaker, plantId, delegationId } = await seed('active')
        const before = {
          caretaker: await remindersOf(caretaker, plantId),
          owner: await remindersOf(owner, plantId),
        }

        const purged = await as(caretaker, purgeAccount(caretaker))

        expect(outcome(purged)).toBe('ok')
        expect(await accountOf(caretaker)).toEqual([])
        expect(await factsOf('delegationId', delegationId)).toEqual([
          {
            _tag: 'DelegationEnded',
            delegationId,
            ownerId: owner,
            caretakerId: caretaker,
            plantIds: [plantId],
            reason: 'accountDeleted',
          },
        ])
        expect({ before, owner: await remindersOf(owner, plantId) }).toEqual({
          before: {
            caretaker: [{ type: 'watering_reminder', status: 'pending' }],
            owner: [],
          },
          owner: [{ type: 'watering_reminder', status: 'pending' }],
        })
      })

      it('leaves the delegation running and says nothing when the delete itself fails', async () => {
        const { caretaker, delegationId } = await seed('active')

        const purged = await as(
          caretaker,
          Effect.gen(function* () {
            const repo = yield* UserRepository
            return yield* purgeAccount(caretaker).pipe(
              Effect.provideService(UserRepository, {
                ...repo,
                delete: () => Effect.die('delete failed'),
              })
            )
          })
        )

        expect(Exit.isFailure(purged)).toBe(true)
        expect(await state(delegationId, caretaker)).toEqual({
          delegation: 'active',
          user: 'active',
          rows: ['watering_reminder'],
        })
        expect(await factsOf('delegationId', delegationId)).toEqual([])
      })
    })

    describe('the hard deletion of an account whose plants are being cared for', () => {
      const canopyOf = async (...members: ReadonlyArray<string>) => {
        const [canopy] = await db
          .insert(schema.canopies)
          .values({ name: 'Home', timezone: 'UTC' })
          .returning()
        if (!canopy) throw new Error('canopy insert returned nothing')
        await db.insert(schema.canopyMembers).values(
          members.map((userId, index) => ({
            canopyId: canopy.id,
            userId,
            role: index === 0 ? ('owner' as const) : ('member' as const),
          }))
        )
        return canopy.id
      }

      const plantOf = async (
        owner: { readonly userId: string } | { readonly canopyId: string },
        createdByUserId: string,
        id: string = crypto.randomUUID()
      ) => {
        await db
          .insert(schema.plants)
          .values({ ...plantValues, ...owner, createdByUserId, id })
        const dueAt = new Date(Date.now() + 3 * DAY)
        await db.insert(schema.plantCareSchedules).values({
          plantId: id,
          careType: 'watering',
          frequencyDays: 7,
          nextCareAt: dueAt,
          dueDay: careDayOf(dueAt),
        })
        return id
      }

      const acceptedPlanOn = async (plantId: string, author: string) => {
        const [plan] = await db
          .insert(schema.carePlans)
          .values({
            plantId,
            userId: author,
            title: 'Rescue',
            status: 'accepted',
          })
          .returning()
        if (!plan) throw new Error('plan insert returned nothing')
        const [step] = await db
          .insert(schema.carePlanSteps)
          .values({
            planId: plan.id,
            position: 0,
            title: 'Water',
            careType: 'watering',
          })
          .returning()
        if (!step) throw new Error('step insert returned nothing')
        return { planId: plan.id, stepId: step.id }
      }

      const sessionsWaitingForALock = async (atLeast: number) => {
        for (const _ of Array.range(1, 100)) {
          const { rows } = await pool.query<{ waiting: number }>(
            `SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
          )
          const waiting = rows[0]?.waiting ?? 0
          if (waiting >= atLeast) return waiting
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        return 0
      }

      const whileAnotherSessionHolds = async <A>(
        plantId: string,
        work: () => Promise<A>
      ) => {
        const session = await pool.connect()
        try {
          await session.query('BEGIN')
          await session.query(`SELECT 1 FROM plants WHERE id = $1 FOR UPDATE`, [
            plantId,
          ])
          return await work()
        } finally {
          await session.query('ROLLBACK')
          session.release()
        }
      }

      const purgePausedBeforeTheDelete = (
        userId: string,
        reached: Deferred.Deferred<void>,
        release: Deferred.Deferred<void>
      ) =>
        as(
          userId,
          Effect.gen(function* () {
            const repo = yield* UserRepository
            return yield* purgeAccount(userId).pipe(
              Effect.provideService(UserRepository, {
                ...repo,
                delete: (id: string) =>
                  pausedBefore(repo.delete(id), reached, release),
              })
            )
          })
        )

      const holdingItsPlants = (
        reached: Deferred.Deferred<void>,
        release: Deferred.Deferred<void>
      ) =>
        careOverStore((store) => ({
          ...store,
          apply: (writes) =>
            pausedBefore(store.apply(writes), reached, release),
        }))

      const purgeWhileACareHoldsItsPlants = async (
        leaver: string,
        care: (
          reached: Deferred.Deferred<void>,
          release: Deferred.Deferred<void>
        ) => Promise<Exit.Exit<unknown, unknown>>
      ) => {
        const before = await deadlocks()
        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const caring = care(reached, release)
        await Effect.runPromise(Deferred.await(reached))
        const purging = as(leaver, purgeAccount(leaver))
        const purgeWaited = await waitsForALock(pool, purging)
        Deferred.doneUnsafe(release, Exit.void)
        return {
          cared: outcome(await caring),
          purged: outcome(await purging),
          purgeWaited,
          deadlocks: (await deadlocks()) - before,
        }
      }

      it.each([{ first: 'canopy plant' }, { first: 'own plant' }] as const)(
        'takes a canopy plant and one of the leaver own plants in id order, the $first first, so a care of both never deadlocks with it',
        async ({ first }) => {
          const owner = await insertUser('canopy-owner')
          const leaver = await insertUser('leaver')
          const canopyId = await canopyOf(owner, leaver)
          const ids = Array.sort(
            Array.make<[string, string]>(
              crypto.randomUUID(),
              crypto.randomUUID()
            ),
            Order.String
          )
          const lower = Array.headNonEmpty(ids)
          const higher = Array.lastNonEmpty(ids)
          const canopyPlant = await plantOf(
            { canopyId },
            owner,
            first === 'canopy plant' ? lower : higher
          )
          const ownPlant = await plantOf(
            { userId: leaver },
            leaver,
            first === 'canopy plant' ? higher : lower
          )
          const before = await deadlocks()

          const raced = await whileAnotherSessionHolds(higher, async () => {
            const purging = as(leaver, purgeAccount(leaver))
            const purgeWaits = await sessionsWaitingForALock(1)
            const caring = as(
              leaver,
              careMultiplePlants({
                plantIds: [canopyPlant, ownPlant],
                careType: 'watering',
              })
            )
            const bothWait = await sessionsWaitingForALock(2)
            return { purging, caring, waiting: [purgeWaits, bothWait] }
          })

          expect({
            waiting: raced.waiting,
            purged: outcome(await raced.purging),
            cared: outcome(await raced.caring),
            deadlocks: (await deadlocks()) - before,
          }).toEqual({
            waiting: [1, 2],
            purged: 'ok',
            cared: 'ConstraintError',
            deadlocks: 0,
          })
          expect(await accountOf(leaver)).toEqual([])
          expect(
            await db
              .select({ id: schema.careLogs.id })
              .from(schema.careLogs)
              .where(eq(schema.careLogs.plantId, canopyPlant))
          ).toEqual([])
        }
      )

      it('holds every plant its delete writes, and no other, before it deletes the account', async () => {
        const owner = await insertUser('canopy-owner')
        const leaver = await insertUser('leaver')
        const neighbor = await insertUser('neighbor')
        const canopyId = await canopyOf(owner, leaver)
        const elsewhere = await canopyOf(neighbor)
        const plantsOf = {
          theirCanopy: await plantOf({ canopyId }, owner),
          theirOwnFromSomeoneElse: await plantOf({ userId: leaver }, neighbor),
          theyCreatedElsewhere: await plantOf({ canopyId: elsewhere }, leaver),
          withAPlanTheyWrote: await plantOf({ userId: neighbor }, neighbor),
          nobodyOfTheirs: await plantOf({ userId: neighbor }, neighbor),
        }
        await acceptedPlanOn(plantsOf.withAPlanTheyWrote, leaver)
        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()

        const purging = purgePausedBeforeTheDelete(leaver, reached, release)
        await Effect.runPromise(Deferred.await(reached))
        const { rows: free } = await pool.query<{ id: string }>(
          `SELECT id FROM plants WHERE id = ANY($1::uuid[]) FOR NO KEY UPDATE SKIP LOCKED`,
          [Object.values(plantsOf)]
        )
        Deferred.doneUnsafe(release, Exit.void)

        expect(outcome(await purging)).toBe('ok')
        expect(free).toEqual([{ id: plantsOf.nobodyOfTheirs }])
      })

      it('dissolves the canopy of its last member, who also has a plant of their own, and deletes the plants of both', async () => {
        const leaver = await insertUser('leaver')
        const canopyId = await canopyOf(leaver)
        const canopyPlant = await plantOf({ canopyId }, leaver)
        const ownPlant = await plantOf({ userId: leaver }, leaver)

        expect(outcome(await as(leaver, purgeAccount(leaver)))).toBe('ok')

        expect(
          await db
            .select({ id: schema.plants.id })
            .from(schema.plants)
            .where(inArray(schema.plants.id, [canopyPlant, ownPlant]))
        ).toEqual([])
        expect(
          await db
            .select({ id: schema.canopies.id })
            .from(schema.canopies)
            .where(eq(schema.canopies.id, canopyId))
        ).toEqual([])
      })

      it('waits for a care of one of the leaver own plants that already holds the plant, without a deadlock', async () => {
        const leaver = await insertUser('leaver')
        const ownPlant = await plantOf({ userId: leaver }, leaver)

        const raced = await purgeWhileACareHoldsItsPlants(
          leaver,
          (reached, release) =>
            as(
              leaver,
              Effect.provide(
                waterAsCurrentUser(ownPlant),
                holdingItsPlants(reached, release)
              )
            )
        )

        expect(raced).toEqual({
          cared: 'ok',
          purged: 'ok',
          purgeWaited: true,
          deadlocks: 0,
        })
        expect(await accountOf(leaver)).toEqual([])
      })

      it.each([
        { what: 'a plan the leaver wrote', author: 'leaver' },
        { what: 'a plant the leaver created', author: 'member' },
      ] as const)(
        'waits for the tick of a member on $what, and the tick commits whole',
        async ({ author }) => {
          const member = await insertUser('canopy-member')
          const leaver = await insertUser('leaver')
          const canopyId = await canopyOf(member)
          const plantId = await plantOf(
            { canopyId },
            author === 'leaver' ? member : leaver
          )
          const { planId, stepId } = await acceptedPlanOn(
            plantId,
            author === 'leaver' ? leaver : member
          )

          const raced = await purgeWhileACareHoldsItsPlants(
            leaver,
            (reached, release) =>
              as(
                member,
                Effect.provide(
                  withCarePlanStep(planId, stepId, 'tick').pipe(
                    Effect.flatMap(completeCarePlanStep)
                  ),
                  holdingItsPlants(reached, release)
                )
              )
          )

          expect(raced).toEqual({
            cared: 'ok',
            purged: 'ok',
            purgeWaited: true,
            deadlocks: 0,
          })
          expect(
            await db
              .select({ by: schema.careLogs.performedByUserId })
              .from(schema.careLogs)
              .where(eq(schema.careLogs.plantId, plantId))
          ).toEqual([{ by: member }])
          expect(await accountOf(leaver)).toEqual([])
        }
      )
    })
  }
)
