import { randomUUID } from 'node:crypto'
import {
  delivered,
  waterAsCurrentUser,
} from '@lily/api/__tests__/integration/care-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import { waitsForALock } from '@lily/api/__tests__/integration/lock-waits'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CareReadsLive } from '@lily/api/contexts/care'
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
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
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

const day = 86_400_000

const BaseLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  NotificationRepositoryLive,
  UserRepositoryLive,
  CarePlanRepositoryLive,
  CanopyRepositoryLive,
  DelegationRepositoryLive,
  RoomRepositoryLive,
  DeviceTokenRepositoryLive,
  ActivityPushTokenRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const outcome = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) => {
      const error = Cause.squash(cause)
      return error instanceof SqlError ? error.reason._tag : 'failed'
    },
  })

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Care racing a care-reminder opt-out - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >

    const as = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      runtime.runPromiseExit(
        delivered(effect).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId, name: userId }),
              createMockEventBus(),
              createMockLimitChecker(),
              createMockMessageQueue(),
              createMockPushService(),
              createMockWeatherProvider(),
              createMockWeatherCache(),
              createMockWeatherRepository(),
              createMockRateLimiterService(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof BaseLive>>
      )

    const deadlocks = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const { rows } = await pool.query<{ deadlocks: string }>(
        `SELECT deadlocks::text AS deadlocks FROM pg_stat_database WHERE datname = current_database()`
      )
      return Number(rows[0]?.deadlocks ?? 0)
    }

    const user = async (prefix: string) => {
      const name = `${prefix}-${randomUUID().slice(0, 8)}`
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name.toLowerCase()}-${Date.now()}-${Math.random()}@example.com`,
          name,
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
          careReminders: true,
          preferredNotificationTime: '09:00',
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    const delegatedPlant = async (ownerId: string, caretakerId: string) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId: ownerId,
          createdByUserId: ownerId,
          name: 'Personal',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('Failed to create plant')
      const dueAt = new Date(Date.now() - day)
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
          ownerId,
          caretakerId,
          status: 'active',
          startDate: new Date(Date.now() - day),
          endDate: new Date(Date.now() + 7 * day),
        })
        .returning()
      if (!delegation) throw new Error('Failed to create delegation')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId: plant.id })
      return plant.id
    }

    const overdueBeforeReminder = async (userId: string, plantId: string) => {
      const [a, b] = [randomUUID(), randomUUID()]
      const low = Order.min(Order.String)(a, b)
      const high = Order.max(Order.String)(a, b)
      const row = (
        id: string,
        type: 'overdue_reminder' | 'watering_reminder'
      ) => ({
        id,
        type,
        userId,
        plantId,
        scheduledAt: new Date(Date.now() + day),
        status: 'pending' as const,
        title: 'Reminder',
        body: 'Reminder',
      })
      await db
        .insert(schema.notifications)
        .values([row(low, 'overdue_reminder'), row(high, 'watering_reminder')])
    }

    const pendingCareRows = async (userId: string) =>
      (
        await pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND status = 'pending'`,
          [userId]
        )
      ).rows[0]?.n ?? 0

    const optOutPausedHoldingItsUserRow = (
      reached: Deferred.Deferred<void>,
      release: Deferred.Deferred<void>
    ) =>
      Layer.effect(
        UserRepository,
        Effect.map(UserRepository, (repo) => ({
          ...repo,
          update: (id, data) =>
            repo.update(id, data).pipe(
              Effect.tap(() => Deferred.succeed(reached, undefined)),
              Effect.tap(() => Deferred.await(release))
            ),
        }))
      )

    const carePausedBeforeRowLocks = (
      reached: Deferred.Deferred<void>,
      release: Deferred.Deferred<void>
    ) =>
      Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          lockReminders: (query) =>
            Deferred.succeed(reached, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(repo.lockReminders(query))
            ),
        }))
      )

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    const raceOptOut = async (bulk: boolean) => {
      const before = await deadlocks()
      const failures: string[] = []
      for (const round of Arr.range(1, 10)) {
        const owner = await user(`OptOutOwner${round}`)
        const caretaker = await user(`OptOutCaretaker${round}`)
        const plantId = await delegatedPlant(owner, caretaker)
        await overdueBeforeReminder(caretaker, plantId)

        const optOutReached = Deferred.makeUnsafe<void>()
        const optOutRelease = Deferred.makeUnsafe<void>()
        const optOut = as(
          caretaker,
          updateUserSettings({ notifications: { careReminders: false } }).pipe(
            Effect.provide(
              optOutPausedHoldingItsUserRow(optOutReached, optOutRelease)
            )
          )
        )
        await Effect.runPromise(Deferred.await(optOutReached))

        const careReached = Deferred.makeUnsafe<void>()
        const careRelease = Deferred.makeUnsafe<void>()
        const paused = carePausedBeforeRowLocks(careReached, careRelease)
        const care: Promise<Exit.Exit<unknown, unknown>> = bulk
          ? as(
              owner,
              delivered(
                careMultiplePlants({
                  plantIds: [plantId],
                  careType: 'watering',
                })
              ).pipe(Effect.provide(paused))
            )
          : as(
              owner,
              delivered(waterAsCurrentUser(plantId)).pipe(
                Effect.provide(paused)
              )
            )
        await Promise.race([
          Effect.runPromise(Deferred.await(careReached)),
          waitsForALock(pool, care),
        ])
        Deferred.doneUnsafe(optOutRelease, Exit.void)
        await waitsForALock(pool, optOut)
        Deferred.doneUnsafe(careRelease, Exit.void)
        const [optedOut, cared] = await Promise.all([optOut, care])

        const left = await pendingCareRows(caretaker)
        if (Exit.isFailure(optedOut) || Exit.isFailure(cared) || left > 0) {
          failures.push(
            `round ${round}: opt-out ${outcome(optedOut)}, care ${outcome(cared)}, caretaker rows ${left}`
          )
        }
      }
      expect(failures).toEqual([])
      expect((await deadlocks()) - before).toBe(0)
    }

    it(
      "a care-reminder opt-out that deletes the caretaker's rows while a care clears their overdue reminder never deadlocks",
      () => raceOptOut(false),
      90_000
    )

    it(
      "a care-reminder opt-out that deletes the caretaker's rows while a bulk care clears their overdue reminder never deadlocks",
      () => raceOptOut(true),
      90_000
    )
  }
)
