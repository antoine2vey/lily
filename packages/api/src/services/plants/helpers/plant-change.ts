import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type {
  NotificationRepository,
  ReminderKey,
} from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantRow,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import { canopyPlantIdsOf } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { reloadOwnedPlant } from '@lily/api/services/plants/helpers/reload-owned-plant'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Array, Effect, Match, Option } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const OWNER_LOCK_KEYSPACE = 1

export const lockUser = (sql: SqlClient.SqlClient, userId: string) =>
  Effect.asVoid(
    sql`SELECT pg_advisory_xact_lock(${OWNER_LOCK_KEYSPACE}, hashtext(${userId}))`
  )

/**
 * Every lock a plant change may take, in the one order every change takes
 * them: the owning user, the Canopy row, the user's delegations, the
 * reminder keys with the reminders' holders, then the plant rows the change
 * reloads. Two changes that meet on any of these wait for each other and
 * never deadlock, because neither holds a later rank while asking for an
 * earlier one. `scope` reads what the change covers once the ranks above it
 * are held, so a concurrent change cannot move a plant in or out between the
 * read and the write.
 */
interface LockPlan<C, S, E, R> {
  readonly user: Option.Option<string>
  readonly canopy: Effect.Effect<C, E, R>
  readonly delegations: Effect.Effect<void, E, R>
  readonly scope: (canopy: C) => Effect.Effect<S, E, R>
  readonly keys: (scope: S) => ReadonlyArray<ReminderKey>
  readonly updatingUser: Option.Option<string>
}

type LockContext = SqlClient.SqlClient | NotificationRepository

const run = <C, S, E, R, A, E2, R2>(
  plan: LockPlan<C, S, E, R>,
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
        yield* plan.delegations
        const scope = yield* plan.scope(canopy)
        return yield* withReminderKeys(
          plan.keys(scope),
          plan.updatingUser
        )(change(scope))
      })
    )
  )

const holdingCanopy = (
  requestedId: string,
  canopyId: string
): Effect.Effect<
  void,
  PlantNotFoundError | SqlError,
  CurrentUser | CanopyRepository
> =>
  Effect.flatMap(CurrentUser, ({ id }) => lockMyCanopy(id)).pipe(
    Effect.filterOrFail(
      ({ canopy }) => canopy.id === canopyId,
      () => new PlantNotFoundError({ plantId: requestedId })
    ),
    Effect.asVoid,
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
          holdingCanopy(requestedId, canopyId)
        ),
        Match.exhaustive
      ),
      delegations: Effect.void,
      scope: () => Effect.succeed(plant),
      keys: (current) => reminderKeysFor([current.id]),
      updatingUser: Option.none(),
    }
    return run(plan, (current) =>
      Effect.flatMap(reloadOwnedPlant(current, requestedId), change)
    )
  }

export interface MemberScope {
  readonly own: ReadonlyArray<string>
  readonly personal: ReadonlyArray<string>
  readonly canopy: ReadonlyArray<string>
}

/**
 * A change to every reminder one member hears: their own plants, the plants
 * they care for, and their Canopy's plants when they are in one.
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
      boolean,
      MemberScope,
      SqlError,
      PlantRepository | CanopyRepository | DelegationRepository
    > = {
      user: Option.none(),
      canopy: lockMyCanopy(userId).pipe(
        Effect.as(true),
        Effect.catchTag('CanopyNotFoundError', () => Effect.succeed(false))
      ),
      delegations: Effect.flatMap(DelegationRepository, (repo) =>
        repo.lockAllForUser(userId)
      ),
      scope: (inCanopy) =>
        Effect.flatMap(PlantRepository, (repo) =>
          Effect.all({
            own: repo.findIdsOwnedBy(userId),
            personal: repo.findPersonalReminderPlantIds(userId),
            canopy: inCanopy
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
