import type { SqlError } from '@effect/sql/SqlError'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { assertCanAccessPlant } from '@lily/api/services/plants/helpers/assert-can-access-plant'
import {
  type PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect } from 'effect'

export const withPlantAuth =
  (plantId: string) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | PlantNotFoundError | PlantNotAuthorizedError | SqlError,
    R | PlantRepository | CurrentUser | DelegationRepository
  > =>
    Effect.gen(function* () {
      const repo = yield* PlantRepository
      const plant = yield* repo.findById(plantId)

      if (!plant) {
        return yield* Effect.fail(new PlantNotFoundError())
      }

      yield* assertCanAccessPlant(plant.userId, plant.id)

      return yield* effect
    }).pipe(Effect.withSpan('withPlantAuth'))
