import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { PlantPhoto } from '@lily/shared/plant'
import { Effect } from 'effect'

export const getPlantPhotos = ({
  plantId,
}: {
  plantId: string
}): Effect.Effect<PlantPhoto[], SqlError, PlantRepository> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    return yield* repo.findPhotos(plantId)
  })
