import type { SqlError } from '@effect/sql/SqlError'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'

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

export const assertCanAccessPlant = (
  plantUserId: string,
  plantId: string
): Effect.Effect<
  void,
  PlantNotAuthorizedError | SqlError,
  CurrentUser | DelegationRepository
> =>
  Effect.flatMap(canAccessPlant(plantUserId, plantId), (allowed) =>
    allowed ? Effect.void : Effect.fail(new PlantNotAuthorizedError())
  )
