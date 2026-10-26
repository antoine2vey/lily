import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  PlantRepository,
  type PlantRow,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  allows,
  type PlantAction,
  type PlantRole,
  plantRole,
} from '@lily/api/services/plants/helpers/plant-access'
import type { PlantOwner } from '@lily/shared'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export type PlantAccessContext =
  | CurrentUser
  | DelegationRepository
  | CanopyRepository

export const resolvePlantRole = (
  plant: PlantRow
): Effect.Effect<Option.Option<PlantRole>, SqlError, PlantAccessContext> =>
  Effect.gen(function* () {
    const { id: userId } = yield* CurrentUser
    const facts =
      plant.owner._tag === 'User'
        ? {
            userId,
            membership: null,
            caretaker:
              plant.owner.userId !== userId &&
              (yield* (yield* DelegationRepository).hasActiveDelegationForPlant(
                userId,
                plant.id
              )),
          }
        : {
            userId,
            membership: yield* (yield* CanopyRepository).findMembershipByUser(
              userId
            ),
            caretaker: false,
          }
    return plantRole(plant, facts)
  }).pipe(Effect.withSpan('resolvePlantRole'))

/**
 * A plant the caller has no role on reads as not found, with the same body
 * as a plant that doesn't exist, so plant ids can't be probed. A role that
 * exists but lacks the action gets 403: that caller can already see the plant.
 */
export const assertPlantAction = (
  plant: PlantRow,
  action: PlantAction
): Effect.Effect<
  void,
  PlantNotFoundError | PlantNotAuthorizedError | SqlError,
  PlantAccessContext
> =>
  Effect.flatMap(
    resolvePlantRole(plant),
    (role): Effect.Effect<void, PlantNotFoundError | PlantNotAuthorizedError> =>
      Option.match(role, {
        onNone: () =>
          Effect.fail(new PlantNotFoundError({ plantId: plant.id })),
        onSome: (role) =>
          allows(action)(role)
            ? Effect.void
            : Effect.fail(new PlantNotAuthorizedError()),
      })
  )

/**
 * The user whose settings, limit and reminders a plant action uses: the owner
 * of a personal plant, or the acting member of a Canopy plant until C3 gives
 * Canopy plants their own limit and C4 their own reminder recipients.
 */
export const settingsUserFor = (
  owner: PlantOwner
): Effect.Effect<string, never, CurrentUser> =>
  owner._tag === 'User'
    ? Effect.succeed(owner.userId)
    : Effect.map(CurrentUser, (user) => user.id)

export const canPerform = (
  plant: PlantRow,
  action: PlantAction
): Effect.Effect<boolean, SqlError, PlantAccessContext> =>
  Effect.map(resolvePlantRole(plant), Option.exists(allows(action)))

/**
 * Fetches a plant by ID, checks the caller may perform `action` on it, and
 * returns the plant.
 *
 * Use `Effect.flatMap` to pass the plant to endpoints that need it, and
 * `Effect.zipRight` or `Effect.andThen` for endpoints that only need the
 * check. Endpoints must not re-fetch a plant received from here.
 */
export const withPlantAuth = (
  plantId: string,
  action: PlantAction
): Effect.Effect<
  PlantWithRoom,
  PlantNotFoundError | PlantNotAuthorizedError | SqlError,
  PlantRepository | PlantAccessContext
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const plant = yield* repo.findById(plantId)

    if (!plant) {
      return yield* new PlantNotFoundError({ plantId })
    }

    yield* assertPlantAction(plant, action)

    return plant
  }).pipe(Effect.withSpan('withPlantAuth', { attributes: { action } }))
