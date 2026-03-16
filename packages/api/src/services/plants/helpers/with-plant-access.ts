import type { SqlError } from '@effect/sql/SqlError'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { assertCanAccessPlant } from '@lily/api/services/plants/helpers/assert-can-access-plant'
import {
  type PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect } from 'effect'

/**
 * Fetches a plant by ID, checks ownership/delegation, and returns the plant.
 *
 * Use `Effect.flatMap` to pass the plant to endpoints that need it (eliminates
 * the double-fetch where `withPlantAuth` loaded the plant for auth and the
 * endpoint loaded it again for business logic).
 *
 * For endpoints that only need authorization (e.g. photo operations), use
 * `Effect.zipRight` to discard the plant value.
 */
export const withPlantAuth = (
  plantId: string
): Effect.Effect<
  PlantWithRoom,
  PlantNotFoundError | PlantNotAuthorizedError | SqlError,
  PlantRepository | CurrentUser | DelegationRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const plant = yield* repo.findById(plantId)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    yield* assertCanAccessPlant(plant.userId, plant.id)

    return plant
  }).pipe(Effect.withSpan('withPlantAuth'))
