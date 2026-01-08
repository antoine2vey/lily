import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { PlantByIdRequest } from '@lily/api/services/plants/utils'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant } from '@lily/shared/plant'
import { Effect } from 'effect'

export const findPlantById = ({
  id,
}: PlantByIdRequest): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PlantRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const plant = yield* repo.findById(id)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return plant
  })
