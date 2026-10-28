import {
  type CanopyMembership,
  CanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  PlantRepository,
  type PlantRow,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  allows,
  canopyRole,
  type KnowledgeView,
  knowledgeView,
  type PlantAction,
  type PlantRole,
  personalRole,
} from '@lily/api/services/plants/helpers/plant-access'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect, Match, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export type PlantAccessContext =
  | CurrentUser
  | DelegationRepository
  | CanopyRepository

export interface Caller {
  readonly userId: string
  readonly membership: Effect.Effect<CanopyMembership | null, SqlError>
}

/**
 * The requesting user with a memoized membership lookup, so a request that
 * touches many plants resolves the membership once and a request that only
 * touches personal plants never resolves it.
 */
export const caller: Effect.Effect<
  Caller,
  never,
  CurrentUser | CanopyRepository
> = Effect.gen(function* () {
  const { id: userId } = yield* CurrentUser
  const canopyRepo = yield* CanopyRepository
  const membership = yield* Effect.cached(
    canopyRepo.findMembershipByUser(userId)
  )
  return { userId, membership }
})

export const plantRoleFor = (
  who: Caller,
  plant: PlantRow
): Effect.Effect<Option.Option<PlantRole>, SqlError, DelegationRepository> =>
  pipe(
    Match.value(plant.owner),
    Match.tag('User', ({ userId: ownerId }) =>
      ownerId === who.userId
        ? Effect.succeed(personalRole(ownerId, who.userId, false))
        : Effect.map(
            Effect.flatMap(DelegationRepository, (repo) =>
              repo.hasActiveDelegationForPlant(who.userId, plant.id)
            ),
            (caretaker) => personalRole(ownerId, who.userId, caretaker)
          )
    ),
    Match.tag('Canopy', ({ canopyId }) =>
      Effect.map(who.membership, (membership) =>
        canopyRole(
          { canopyId, createdByUserId: plant.createdByUserId },
          who.userId,
          membership
        )
      )
    ),
    Match.exhaustive
  ).pipe(Effect.withSpan('plantRoleFor'))

export const resolvePlantRole = (
  plant: PlantRow
): Effect.Effect<Option.Option<PlantRole>, SqlError, PlantAccessContext> =>
  Effect.flatMap(caller, (who) => plantRoleFor(who, plant))

/**
 * A plant the caller has no role on reads as not found, with the same body
 * as a plant that doesn't exist, so plant ids can't be probed: both echo the
 * id exactly as the caller sent it. A role that exists but lacks the action
 * gets 403: that caller can already see the plant.
 */
const authorizedRole = (
  requestedId: string,
  plant: PlantRow,
  action: PlantAction
): Effect.Effect<
  PlantRole,
  PlantNotFoundError | PlantNotAuthorizedError | SqlError,
  PlantAccessContext
> =>
  Effect.flatMap(
    resolvePlantRole(plant),
    (
      role
    ): Effect.Effect<PlantRole, PlantNotFoundError | PlantNotAuthorizedError> =>
      Option.match(role, {
        onNone: () =>
          Effect.fail(new PlantNotFoundError({ plantId: requestedId })),
        onSome: (role) =>
          allows(action)(role)
            ? Effect.succeed(role)
            : Effect.fail(new PlantNotAuthorizedError()),
      })
  )

export const assertPlantAction = (
  requestedId: string,
  plant: PlantRow,
  action: PlantAction
): Effect.Effect<
  void,
  PlantNotFoundError | PlantNotAuthorizedError | SqlError,
  PlantAccessContext
> => Effect.asVoid(authorizedRole(requestedId, plant, action))

export const canPerform = (
  who: Caller,
  plant: PlantRow,
  action: PlantAction
): Effect.Effect<boolean, SqlError, DelegationRepository> =>
  Effect.map(plantRoleFor(who, plant), Option.exists(allows(action)))

/**
 * Fetches a plant by ID, checks the caller may perform `action` on it, and
 * returns the plant.
 *
 * Use `Effect.flatMap` to pass the plant to endpoints that need it, and
 * `Effect.zipRight` or `Effect.andThen` for endpoints that only need the
 * check. Endpoints must not re-fetch a plant received from here.
 */
export const withPlantKnowledge = (
  plantId: string,
  action: PlantAction
): Effect.Effect<
  { readonly plant: PlantWithRoom; readonly view: KnowledgeView },
  PlantNotFoundError | PlantNotAuthorizedError | SqlError,
  PlantRepository | PlantAccessContext
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const { id: viewerId } = yield* CurrentUser
    const plant = yield* repo.findById(plantId)

    if (!plant) {
      return yield* new PlantNotFoundError({ plantId })
    }

    const role = yield* authorizedRole(plantId, plant, action)

    return { plant, view: knowledgeView(role, viewerId) }
  }).pipe(Effect.withSpan('withPlantAuth', { attributes: { action } }))

export const withPlantAuth = (
  plantId: string,
  action: PlantAction
): Effect.Effect<
  PlantWithRoom,
  PlantNotFoundError | PlantNotAuthorizedError | SqlError,
  PlantRepository | PlantAccessContext
> => Effect.map(withPlantKnowledge(plantId, action), ({ plant }) => plant)
