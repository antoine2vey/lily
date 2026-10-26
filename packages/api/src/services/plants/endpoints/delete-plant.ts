import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const deletePlant = (
  plant: PlantWithRoom
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError,
  PlantRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const deleted = yield* repo.delete(plant.id, plant.owner)

    if (!deleted) {
      return yield* new PlantNotFoundError({ plantId: plant.id })
    }

    return plant
  }).pipe(
    Effect.withSpan('PlantsService.deletePlant', {
      attributes: { 'plant.id': plant.id },
    })
  )
