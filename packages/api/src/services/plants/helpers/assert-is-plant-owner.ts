import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'

/**
 * Owner-only gate. Unlike `assertCanAccessPlant`, an active delegation does
 * not grant access: lifecycle actions (say goodbye, bring back, delete) are
 * the owner's alone.
 */
export const assertIsPlantOwner = (
  plantUserId: string
): Effect.Effect<void, PlantNotAuthorizedError, CurrentUser> =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    if (currentUserId !== plantUserId) {
      return yield* new PlantNotAuthorizedError()
    }
  }).pipe(Effect.withSpan('assertIsPlantOwner'))
