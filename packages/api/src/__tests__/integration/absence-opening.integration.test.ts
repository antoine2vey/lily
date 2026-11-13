import {
  absenceOverStore,
  waitsForALock,
} from '@lily/api/__tests__/integration/absence-layers'
import { delivered } from '@lily/api/__tests__/integration/canopy-layers'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { Absence } from '@lily/api/contexts/absence'
import { CanopyLive } from '@lily/api/contexts/canopy'
import { CareReadsLive } from '@lily/api/contexts/care'
import { Actor, mintPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
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
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { deletePlant } from '@lily/api/services/plants/endpoints/delete-plant'
import { sharePlantWithCanopy } from '@lily/api/services/plants/endpoints/share-plant-with-canopy'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Cause,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  References,
} from 'effect'
import { SqlError } from 'effect/sql/SqlError'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

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
  ActivityPushTokenRepositoryLive,
  SubscriptionRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const answer = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) => {
      const error = Cause.squash(cause)
      return error instanceof SqlError
        ? `SqlError ${error.reason._tag}`
        : typeof error === 'object' && error !== null && '_tag' in error
          ? String(error._tag)
          : 'died'
    },
  })

interface Pause {
  readonly reached: Deferred.Deferred<void>
  readonly release: Deferred.Deferred<void>
}

const here = ({ reached, release }: Pause) =>
  Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(release))

const openingPausedHoldingItsLocks = (pause: Pause) =>
  absenceOverStore((store) => ({
    ...store,
    lockForOpening: (request) =>
      store.lockForOpening(request).pipe(Effect.tap(() => here(pause))),
  }))

const purgePausedAfterItsDelete = (pause: Pause) =>
  Layer.effect(
    UserRepository,
    Effect.map(UserRepository, (repo) => ({
      ...repo,
      delete: (userId: string) =>
        repo.delete(userId).pipe(Effect.tap(() => here(pause))),
    }))
  )

const sharePausedAfterItsReads = (pause: Pause) =>
  Layer.fresh(CanopyLive).pipe(
    Layer.provide(
      Layer.effect(
        DelegationRepository,
        Effect.map(DelegationRepository, (repo) => ({
          ...repo,
          hasOpenDelegationForPlant: (plantId: string) =>
            repo
              .hasOpenDelegationForPlant(plantId)
              .pipe(Effect.tap(() => here(pause))),
        }))
      )
    )
  )

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Opening a delegation while what it names changes - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >
    let owner: string
    let caretaker: string
    let plant: string

    const as = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      runtime.runPromiseExit(
        delivered(effect).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId, name: userId }),
              createMockEventBus(),
              createMockLimitChecker(),
              createMockMessageQueue(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof BaseLive>>
      )

    const user = async (name: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${Date.now()}-${Math.random()}@example.com`,
          name,
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    const personalPlant = async (ownerId: string) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          userId: ownerId,
          createdByUserId: ownerId,
          name: 'Fern',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!row) throw new Error('Failed to create plant')
      return row.id
    }

    const inACanopy = async (userId: string) => {
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'UTC' })
        .returning()
      if (!canopy) throw new Error('Failed to create canopy')
      await db
        .insert(schema.canopyMembers)
        .values({ canopyId: canopy.id, userId, role: 'owner' })
      return canopy.id
    }

    const open = () =>
      Effect.flatMap(Absence, (absence) =>
        absence.openDelegation({
          by: owner,
          caretakerId: caretaker,
          start: DateTime.add(DateTime.nowUnsafe(), { days: 1 }),
          end: DateTime.add(DateTime.nowUnsafe(), { days: 7 }),
          message: Option.none(),
          plantIds: [plant],
        })
      )

    const thePlant = Effect.flatMap(PlantRepository, (repo) =>
      repo.findById(plant)
    ).pipe(
      Effect.flatMap((found) =>
        found === null ? Effect.die(`no plant ${plant}`) : Effect.succeed(found)
      )
    )

    const deleteThePlant = Effect.flatMap(thePlant, (found) =>
      deletePlant(found)
    )

    const shareThePlant = () =>
      sharePlantWithCanopy(
        mintPermit(plant, 'share', Actor.User({ userId: owner })),
        {}
      )

    const pause = (): Pause => ({
      reached: Deferred.makeUnsafe<void>(),
      release: Deferred.makeUnsafe<void>(),
    })

    const raced = async <A, B>(
      at: Pause,
      first: Promise<Exit.Exit<A, unknown>>,
      second: () => Promise<Exit.Exit<B, unknown>>
    ) => {
      await Effect.runPromise(Deferred.await(at.reached))
      const arriving = second()
      const waited = await waitsForALock(pool, arriving)
      Deferred.doneUnsafe(at.release, Exit.void)
      return {
        first: answer(await first),
        second: answer(await arriving),
        secondWaited: waited,
      }
    }

    const delegations = () =>
      db
        .select({
          status: schema.careDelegations.status,
          plantId: schema.delegationPlants.plantId,
        })
        .from(schema.careDelegations)
        .leftJoin(
          schema.delegationPlants,
          eq(schema.delegationPlants.delegationId, schema.careDelegations.id)
        )

    const ownerOfThePlant = async () => {
      const [row] = await db
        .select({
          userId: schema.plants.userId,
          canopyId: schema.plants.canopyId,
        })
        .from(schema.plants)
        .where(eq(schema.plants.id, plant))
      return row
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
    })

    beforeEach(async () => {
      for (const table of [
        'outbox',
        'notifications',
        'care_delegations',
        'canopy_members',
        'plants',
        'canopies',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      owner = await user('owner')
      caretaker = await user('caretaker')
      plant = await personalPlant(owner)
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    it('makes a purge of the caretaker wait for an opening that already holds the account', async () => {
      const at = pause()

      const result = await raced(
        at,
        as(owner, Effect.provide(open(), openingPausedHoldingItsLocks(at))),
        () => as(caretaker, purgeAccount(caretaker))
      )

      expect(result).toEqual({ first: 'ok', second: 'ok', secondWaited: true })
      expect(await delegations()).toEqual([])
    })

    it('answers that the caretaker is unknown when the opening arrives while the caretaker is purged', async () => {
      const at = pause()

      const result = await raced(
        at,
        as(
          caretaker,
          Effect.provide(purgeAccount(caretaker), purgePausedAfterItsDelete(at))
        ),
        () => as(owner, open())
      )

      expect(result).toEqual({
        first: 'ok',
        second: 'UserNotFoundError',
        secondWaited: true,
      })
      expect(await delegations()).toEqual([])
    })

    it('makes a delete of a requested plant wait for an opening that already holds the plant', async () => {
      const at = pause()

      const result = await raced(
        at,
        as(owner, Effect.provide(open(), openingPausedHoldingItsLocks(at))),
        () => as(owner, deleteThePlant)
      )

      expect(result).toEqual({ first: 'ok', second: 'ok', secondWaited: true })
      expect(await delegations()).toEqual([
        { status: 'pending', plantId: null },
      ])
    })

    it('answers that the plant is not theirs when the opening arrives while the plant is deleted', async () => {
      const at = pause()

      const result = await raced(
        at,
        as(owner, transact(Effect.tap(deleteThePlant, () => here(at)))),
        () => as(owner, open())
      )

      expect(result).toEqual({
        first: 'ok',
        second: 'PlantNotAuthorizedError',
        secondWaited: true,
      })
      expect(await delegations()).toEqual([])
    })

    it('refuses to share a plant into a canopy when an opening of it got there first', async () => {
      await inACanopy(owner)
      const at = pause()

      const result = await raced(
        at,
        as(owner, Effect.provide(open(), openingPausedHoldingItsLocks(at))),
        () => as(owner, shareThePlant())
      )

      expect(result).toEqual({
        first: 'ok',
        second: 'PlantInDelegationError',
        secondWaited: true,
      })
      expect(await delegations()).toEqual([
        { status: 'pending', plantId: plant },
      ])
      expect(await ownerOfThePlant()).toEqual({ userId: owner, canopyId: null })
    })

    it('refuses to open a delegation of a plant when its share into a canopy got there first', async () => {
      const canopyId = await inACanopy(owner)
      const at = pause()

      const result = await raced(
        at,
        as(
          owner,
          Effect.provide(shareThePlant(), sharePausedAfterItsReads(at))
        ),
        () => as(owner, open())
      )

      expect(result).toEqual({
        first: 'ok',
        second: 'CanopyPlantNotDelegableError',
        secondWaited: true,
      })
      expect(await delegations()).toEqual([])
      expect(await ownerOfThePlant()).toEqual({ userId: null, canopyId })
    })
  }
)
