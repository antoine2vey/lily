import type { SqlError } from '@effect/sql/SqlError'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { PlantByIdRequest } from '@lily/api/services/plants/utils'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { PlantPhoto } from '@lily/shared/plant'
import { Effect } from 'effect'

type PlantDetailResult = PlantWithRoom & {
  photos: readonly PlantPhoto[]
}

export const findPlantById = ({
  id,
}: PlantByIdRequest): Effect.Effect<
  PlantDetailResult,
  SqlError | PlantNotFoundError,
  PlantRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const plant = yield* repo.findById(id)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    // Fetch recent photos (limit 10 for the detail view)
    const photosResult = yield* repo.findPhotos({
      plantId: id,
      page: 1,
      limit: 10,
    })

    return {
      ...plant,
      photos: photosResult.items,
    }
  }).pipe(
    Effect.withSpan('PlantsService.findPlantById', {
      attributes: { 'plant.id': id },
    })
  )
