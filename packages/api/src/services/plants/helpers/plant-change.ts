import {
  type CanopyMembership,
  CanopyRepository,
  type CanopyRow,
} from '@lily/api/repositories/canopy.repository'
import {
  type DelegationPlantRow,
  DelegationRepository,
  type DelegationRow,
} from '@lily/api/repositories/delegation.repository'
import { sameOwner } from '@lily/api/repositories/helpers/plant-owner'
import {
  NotificationRepository,
  type ReminderKey,
} from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantRow,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { requireMembership } from '@lily/api/services/canopy/helpers/membership'
import { canopyPlantIdsOf } from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  holdingReminderKeys,
  reminderKeysFor,
} from '@lily/api/services/plants/helpers/reminder-keys'
import {
  CanopyNotFoundError,
  type CareType,
  type PlantOwner,
} from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Array, Effect, identity, Match, Option, Order } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const OWNER_LOCK_KEYSPACE = 1

export const lockUser = (sql: SqlClient.SqlClient, userId: string) =>
  Effect.asVoid(
    sql`SELECT pg_advisory_xact_lock(${OWNER_LOCK_KEYSPACE}, hashtext(${userId}))`
  )

export interface CareLock {
  readonly plantId: string
  readonly careType: CareType
}

const careLockOrder: Order.Order<CareLock> = Order.combine(
  Order.mapInput(Order.String, (lock: CareLock) => lock.plantId),
  Order.mapInput(Order.String, (lock: CareLock) => lock.careType)
)

const lockCare = (sql: SqlClient.SqlClient, { plantId, careType }: CareLock) =>
  Effect.asVoid(
    sql`SELECT pg_advisory_xact_lock(hashtext(${plantId}), hashtext(${careType}))`
  )

export interface LockedCanopy {
  readonly canopy: CanopyRow
  readonly membership: CanopyMembership
}

const lockMyCanopy = (
  userId: string
): Effect.Effect<
  LockedCanopy,
  CanopyNotFoundError | SqlError,
  CanopyRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository
    const seen = yield* requireMembership(userId)
    const canopy = yield* repo.lock(seen.canopyId)
    const membership = yield* requireMembership(userId)
    if (canopy === null || membership.canopyId !== canopy.id) {
      return yield* new CanopyNotFoundError()
    }
    return { canopy, membership }
  })

/**
 * Every lock a plant change may take, in the one order every change takes
 * them: the owning user, the Canopy row, the care locks in plant id then care
 * type order, the delegation rows, the reminder keys with the reminders'
 * holders, then the plant rows the change reloads. Two changes that meet on
 * any of these wait for each other and never deadlock, because neither holds
 * a later rank while asking for an earlier one. `scope` reads what the change
 * covers once the ranks above it are held, so a concurrent change cannot move
 * a plant in or out between the read and the write.
 */
interface LockPlan<C, D, S, E, R> {
  readonly user: Option.Option<string>
  readonly canopy: Effect.Effect<C, E, R>
  readonly care: ReadonlyArray<CareLock>
  readonly delegations: Effect.Effect<D, E, R>
  readonly scope: (canopy: C, delegations: D) => Effect.Effect<S, E, R>
  readonly keys: (scope: S) => ReadonlyArray<ReminderKey>
  readonly updatingUser: Option.Option<string>
}

type LockContext = SqlClient.SqlClient | NotificationRepository

const run = <C, D, S, E, R, A, E2, R2>(
  plan: LockPlan<C, D, S, E, R>,
  change: (scope: S) => Effect.Effect<A, E2, R2>
): Effect.Effect<A, E | E2 | SqlError, R | R2 | LockContext> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(
      Effect.gen(function* () {
        yield* Option.match(plan.user, {
          onNone: () => Effect.void,
          onSome: (userId) => lockUser(sql, userId),
        })
        const canopy = yield* plan.canopy
        yield* Effect.forEach(
          Array.sort(plan.care, careLockOrder),
          (lock) => lockCare(sql, lock),
          { discard: true }
        )
        const delegations = yield* plan.delegations
        const scope = yield* plan.scope(canopy, delegations)
        const keys = plan.keys(scope)
        yield* Effect.flatMap(NotificationRepository, (repo) =>
          repo.lockReminderKeys(keys, plan.updatingUser)
        )
        return yield* holdingReminderKeys(keys)(change(scope))
      })
    )
  )

const reloadOwnedPlant = (
  plant: PlantRow,
  requestedId: string
): Effect.Effect<PlantRow, PlantNotFoundError | SqlError, PlantRepository> =>
  Effect.flatMap(PlantRepository, (repo) => repo.findByIds([plant.id])).pipe(
    Effect.flatMap((rows) =>
      Option.match(
        Array.findFirst(rows, (row) => sameOwner(row.owner, plant.owner)),
        {
          onNone: () =>
            Effect.fail(new PlantNotFoundError({ plantId: requestedId })),
          onSome: Effect.succeed,
        }
      )
    )
  )

const holdingCanopy = (
  requestedId: string,
  canopyId: string
): Effect.Effect<
  LockedCanopy,
  PlantNotFoundError | SqlError,
  CurrentUser | CanopyRepository
> =>
  Effect.flatMap(CurrentUser, ({ id }) => lockMyCanopy(id)).pipe(
    Effect.filterOrFail(
      ({ canopy }) => canopy.id === canopyId,
      () => new PlantNotFoundError({ plantId: requestedId })
    ),
    Effect.catchTag('CanopyNotFoundError', () =>
      Effect.fail(new PlantNotFoundError({ plantId: requestedId }))
    )
  )

/**
 * A change to one plant. A personal plant is locked through its owner; a
 * Canopy plant through the caller's Canopy, which must be the plant's, so a
 * removed member gets `PlantNotFoundError` like anyone else outside it. The
 * change receives the row reloaded under the locks.
 */
export const changePlant =
  (plant: PlantRow, requestedId: string = plant.id) =>
  <A, E, R>(
    change: (current: PlantRow) => Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | PlantNotFoundError | SqlError,
    R | LockContext | PlantRepository | CurrentUser | CanopyRepository
  > => {
    const plan: LockPlan<
      void,
      void,
      PlantRow,
      PlantNotFoundError | SqlError,
      CurrentUser | CanopyRepository
    > = {
      user: Match.value(plant.owner).pipe(
        Match.tag('User', ({ userId }) => Option.some(userId)),
        Match.tag('Canopy', () => Option.none<string>()),
        Match.exhaustive
      ),
      canopy: Match.value(plant.owner).pipe(
        Match.tag('User', () => Effect.void),
        Match.tag('Canopy', ({ canopyId }) =>
          Effect.asVoid(holdingCanopy(requestedId, canopyId))
        ),
        Match.exhaustive
      ),
      care: [],
      delegations: Effect.void,
      scope: () => Effect.succeed(plant),
      keys: (current) => reminderKeysFor([current.id]),
      updatingUser: Option.none(),
    }
    return run(plan, (current) =>
      Effect.flatMap(reloadOwnedPlant(current, requestedId), change)
    )
  }

/**
 * A move between the caller and their Canopy, in either direction. The
 * caller is locked first, then their Canopy, which must be the plant's when
 * the plant is shared. A sharer without a Canopy gets `CanopyNotFoundError`;
 * a member whose Canopy no longer holds the plant gets `PlantNotFoundError`.
 * The change receives the reloaded row and the locked Canopy.
 */
export const movePlant =
  (plant: PlantRow, requestedId: string = plant.id) =>
  <A, E, R>(
    change: (current: PlantRow, locked: LockedCanopy) => Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | PlantNotFoundError | CanopyNotFoundError | SqlError,
    R | LockContext | PlantRepository | CurrentUser | CanopyRepository
  > =>
    Effect.flatMap(CurrentUser, ({ id: userId }) => {
      const plan: LockPlan<
        LockedCanopy,
        void,
        LockedCanopy,
        PlantNotFoundError | CanopyNotFoundError | SqlError,
        CurrentUser | CanopyRepository
      > = {
        user: Option.some(userId),
        canopy: Match.value(plant.owner).pipe(
          Match.tag('User', () => lockMyCanopy(userId)),
          Match.tag('Canopy', ({ canopyId }) =>
            holdingCanopy(requestedId, canopyId)
          ),
          Match.exhaustive
        ),
        care: [],
        delegations: Effect.void,
        scope: Effect.succeed,
        keys: () => reminderKeysFor([plant.id]),
        updatingUser: Option.none(),
      }
      return run(plan, (locked) =>
        Effect.flatMap(reloadOwnedPlant(plant, requestedId), (current) =>
          change(current, locked)
        )
      )
    })

export interface MemberScope {
  readonly locked: Option.Option<LockedCanopy>
  readonly own: ReadonlyArray<string>
  readonly personal: ReadonlyArray<string>
  readonly canopy: ReadonlyArray<string>
}

/**
 * A change to every reminder one member hears: their own plants, the plants
 * they care for, and their Canopy's plants when they are in one. The change
 * receives the locked Canopy, when there is one, so it never locks it again.
 */
export const changeMember =
  (userId: string) =>
  <A, E, R>(
    change: (scope: MemberScope) => Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | SqlError,
    R | LockContext | PlantRepository | CanopyRepository | DelegationRepository
  > => {
    const plan: LockPlan<
      Option.Option<LockedCanopy>,
      void,
      MemberScope,
      SqlError,
      PlantRepository | CanopyRepository | DelegationRepository
    > = {
      user: Option.none(),
      canopy: lockMyCanopy(userId).pipe(
        Effect.map(Option.some),
        Effect.catchTag('CanopyNotFoundError', () =>
          Effect.succeed(Option.none<LockedCanopy>())
        )
      ),
      care: [],
      delegations: Effect.flatMap(DelegationRepository, (repo) =>
        repo.lockAllForUser(userId)
      ),
      scope: (locked) =>
        Effect.flatMap(PlantRepository, (repo) =>
          Effect.all({
            locked: Effect.succeed(locked),
            own: repo.findIdsOwnedBy(userId),
            personal: repo.findPersonalReminderPlantIds(userId),
            canopy: Option.isSome(locked)
              ? canopyPlantIdsOf(userId)
              : Effect.succeed(Array.empty<string>()),
          })
        ),
      keys: ({ personal, canopy }) =>
        reminderKeysFor(Array.dedupe([...personal, ...canopy])),
      updatingUser: Option.some(userId),
    }
    return run(plan, change)
  }

interface CanopyScope<C> {
  readonly held: C
  readonly plantIds: ReadonlyArray<string>
}

const canopyPlan = <C, E, R>(
  lock: Effect.Effect<C, E, R>,
  rowOf: (held: C) => CanopyRow
): LockPlan<C, void, CanopyScope<C>, E | SqlError, R | CanopyRepository> => ({
  user: Option.none(),
  canopy: lock,
  care: [],
  delegations: Effect.void,
  scope: (held) =>
    Effect.map(
      Effect.flatMap(CanopyRepository, (repo) =>
        repo.findPlantIdsOfCanopy(rowOf(held).id)
      ),
      (plantIds) => ({ held, plantIds })
    ),
  keys: ({ plantIds }) => reminderKeysFor(plantIds),
  updatingUser: Option.none(),
})

const lockCanopy = (
  canopyId: string
): Effect.Effect<CanopyRow, CanopyNotFoundError | SqlError, CanopyRepository> =>
  Effect.flatMap(CanopyRepository, (repo) => repo.lock(canopyId)).pipe(
    Effect.flatMap((row) =>
      row === null
        ? Effect.fail(new CanopyNotFoundError())
        : Effect.succeed(row)
    )
  )

/**
 * A change to a Canopy by id, for a caller who does not act through a
 * membership in it, such as someone joining. The row is locked, then every
 * plant it holds. The change receives the row and those plant ids.
 */
export const changeCanopy =
  (canopyId: string) =>
  <A, E, R>(
    change: (
      canopy: CanopyRow,
      plantIds: ReadonlyArray<string>
    ) => Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | CanopyNotFoundError | SqlError,
    R | LockContext | CanopyRepository
  > =>
    run(canopyPlan(lockCanopy(canopyId), identity), ({ held, plantIds }) =>
      change(held, plantIds)
    )

/**
 * A change to the caller's own Canopy. The row is locked through the
 * caller's membership, then every plant it holds. The change receives the
 * locked Canopy with that membership, so it can check the role, and the
 * plant ids.
 */
export const changeMyCanopy =
  (userId: string) =>
  <A, E, R>(
    change: (
      locked: LockedCanopy,
      plantIds: ReadonlyArray<string>
    ) => Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | CanopyNotFoundError | SqlError,
    R | LockContext | CanopyRepository
  > =>
    run(
      canopyPlan(lockMyCanopy(userId), ({ canopy }) => canopy),
      ({ held, plantIds }) => change(held, plantIds)
    )

const myCanopyOf = (
  userId: string,
  canopyId: string
): Effect.Effect<
  LockedCanopy,
  CanopyNotFoundError | SqlError,
  CanopyRepository
> =>
  lockMyCanopy(userId).pipe(
    Effect.filterOrFail(
      ({ canopy }) => canopy.id === canopyId,
      () => new CanopyNotFoundError()
    )
  )

/**
 * An addition to what a user holds on their own, such as a delegation.
 * Only the user is locked: the thing added does not exist yet.
 */
export const changeOwn =
  (userId: string) =>
  <A, E, R>(
    change: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | SqlError, R | LockContext> =>
    run({ ...keysOnly([]), user: Option.some(userId) }, () => change)

/**
 * An addition to what an owner holds, such as a new plant or room. A
 * personal owner is locked as a user; a Canopy owner through the caller's
 * membership, which must be in that Canopy.
 */
export const changeCollection =
  (owner: PlantOwner) =>
  <A, E, R>(
    change: Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | CanopyNotFoundError | SqlError,
    R | LockContext | CanopyRepository | CurrentUser
  > =>
    Match.value(owner).pipe(
      Match.tag('User', ({ userId }) => changeOwn(userId)(change)),
      Match.tag('Canopy', ({ canopyId }) =>
        run(
          {
            ...keysOnly([]),
            canopy: Effect.flatMap(CurrentUser, ({ id }) =>
              Effect.asVoid(myCanopyOf(id, canopyId))
            ),
          },
          () => change
        )
      ),
      Match.exhaustive
    )

/**
 * A change to the invitations of the caller's Canopy. The row is locked
 * through the membership so a leave or dissolve cannot race it; no plant or
 * reminder is involved.
 */
export const changeInvitations =
  (userId: string) =>
  <A, E, R>(
    change: (locked: LockedCanopy) => Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | CanopyNotFoundError | SqlError,
    R | LockContext | CanopyRepository
  > => {
    const plan: LockPlan<
      LockedCanopy,
      void,
      LockedCanopy,
      CanopyNotFoundError | SqlError,
      CanopyRepository
    > = {
      user: Option.none(),
      canopy: lockMyCanopy(userId),
      care: [],
      delegations: Effect.void,
      scope: (locked) => Effect.succeed(locked),
      keys: () => [],
      updatingUser: Option.none(),
    }
    return run(plan, change)
  }

const keysOnly = (
  keys: ReadonlyArray<ReminderKey>
): LockPlan<void, void, void, never, never> => ({
  user: Option.none(),
  canopy: Effect.void,
  care: [],
  delegations: Effect.void,
  scope: () => Effect.void,
  keys: () => keys,
  updatingUser: Option.none(),
})

/**
 * A change to the care of some plants by a caller who need not be signed
 * in, such as a scheduler. Each care lock is taken in plant id then care type
 * order, so bulk care and single care never deadlock, and only the reminders
 * of those care types are held.
 */
export const changeCare =
  (locks: ReadonlyArray<CareLock>) =>
  <A, E, R>(
    change: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | SqlError, R | LockContext> =>
    run(
      {
        ...keysOnly(
          Array.map(locks, ({ plantId, careType }) => ({
            plantId,
            type: `${careType}_reminder` as const,
          }))
        ),
        care: locks,
      },
      () => change
    )

/**
 * A change to the reminders of some plants with no other lock, for a caller
 * that only reschedules them, such as the overdue scheduler.
 */
export const changeReminders =
  (plantIds: ReadonlyArray<string>) =>
  <A, E, R>(
    change: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | SqlError, R | LockContext> =>
    run(keysOnly(reminderKeysFor(plantIds)), () => change)

export type HandedOver = ReadonlyArray<
  readonly [DelegationRow, ReadonlyArray<DelegationPlantRow>]
>

export const handedOverPlantIds = (
  handedOver: HandedOver
): ReadonlyArray<string> =>
  Array.dedupe(
    Array.flatMap(handedOver, ([, plants]) =>
      Array.map(plants, (plant) => plant.id)
    )
  )

/**
 * A change that moves delegations between statuses. The transition's
 * conditional UPDATE is the row lock at the delegation rank; the plants each
 * moved delegation hands over are read under it and their reminders held, so
 * the rebuild never races a member change by either party.
 */
export const changeDelegations =
  <E, R>(transition: Effect.Effect<ReadonlyArray<DelegationRow>, E, R>) =>
  <A, E2, R2>(
    change: (handedOver: HandedOver) => Effect.Effect<A, E2, R2>
  ): Effect.Effect<
    A,
    E | E2 | SqlError,
    R | R2 | LockContext | DelegationRepository
  > => {
    const plan: LockPlan<
      void,
      ReadonlyArray<DelegationRow>,
      HandedOver,
      E | SqlError,
      R | DelegationRepository
    > = {
      user: Option.none(),
      canopy: Effect.void,
      care: [],
      delegations: transition,
      scope: (_, transitioned) =>
        Effect.flatMap(DelegationRepository, (repo) =>
          Effect.forEach(transitioned, (delegation) =>
            Effect.map(
              repo.getPlantsByDelegation(delegation.id),
              (plants) => [delegation, plants] as const
            )
          )
        ),
      keys: (handedOver) => reminderKeysFor(handedOverPlantIds(handedOver)),
      updatingUser: Option.none(),
    }
    return run(plan, change)
  }
