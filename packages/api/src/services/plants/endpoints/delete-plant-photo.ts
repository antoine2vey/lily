import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { Effect } from 'effect'

export const deletePlantPhoto = ({
  plantId,
  photoId,
}: {
  plantId: string
  photoId: string
}): Effect.Effect<void, SqlError, PlantRepository> => {
  return Effect.gen(function* () {
    const repo = yield* PlantRepository
    yield* repo.deletePhotoByPlantId(plantId, photoId)
  }).pipe(
    Effect.withSpan('PlantsService.deletePlantPhoto', {
      attributes: { 'plant.id': plantId, 'photo.id': photoId },
    })
  )
}
