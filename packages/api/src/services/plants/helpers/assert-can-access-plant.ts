import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const canAccessPlant = (
  plantUserId: string,
  plantId: string
): Effect.Effect<boolean, SqlError, CurrentUser | DelegationRepository> =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser

    if (currentUserId === plantUserId) {
      return true
    }

    const delegationRepo = yield* DelegationRepository
    return yield* delegationRepo.hasActiveDelegationForPlant(
      currentUserId,
      plantId
    )
  }).pipe(Effect.withSpan('canAccessPlant'))

/**
 * A plant you can't access reads as not found, the same answer as a plant
 * that doesn't exist, so plant ids can't be probed.
 */
export const assertCanAccessPlant = (
  plantUserId: string,
  plantId: string
): Effect.Effect<
  void,
  PlantNotFoundError | SqlError,
  CurrentUser | DelegationRepository
> =>
  Effect.flatMap(canAccessPlant(plantUserId, plantId), (allowed) =>
    allowed ? Effect.void : Effect.fail(new PlantNotFoundError({ plantId }))
  )
