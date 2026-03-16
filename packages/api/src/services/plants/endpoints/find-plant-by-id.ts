import type { SqlError } from '@effect/sql/SqlError'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { PlantPhoto } from '@lily/shared/plant'
import { Effect } from 'effect'

type PlantDetailResult = PlantWithRoom & {
  photos: readonly PlantPhoto[]
}

export const findPlantById = (
  plant: PlantWithRoom
): Effect.Effect<PlantDetailResult, SqlError, PlantRepository> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository

    // Fetch recent photos (limit 10 for the detail view)
    const photosResult = yield* repo.findPhotos({
      plantId: plant.id,
      page: 1,
      limit: 10,
    })

    return {
      ...plant,
      photos: photosResult.items,
    }
  }).pipe(
    Effect.withSpan('PlantsService.findPlantById', {
      attributes: { 'plant.id': plant.id },
    })
  )
