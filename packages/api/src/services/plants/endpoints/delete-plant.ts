import { PlantLife } from '@lily/api/contexts/care'
import type { PlantPermit } from '@lily/api/kernel/permit'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'

export const deletePlant = (
  plant: PlantWithRoom,
  permit: PlantPermit<'delete'>,
  requestedId: string = plant.id
): Effect.Effect<PlantWithRoom, PlantNotFoundError, PlantLife> =>
  Effect.gen(function* () {
    const life = yield* PlantLife

    yield* life
      .remove({ permit, seenOwner: plant.owner })
      .pipe(
        Effect.mapError(() => new PlantNotFoundError({ plantId: requestedId }))
      )

    return { ...plant, room: null, schedules: [] }
  }).pipe(
    Effect.withSpan('PlantsService.deletePlant', {
      attributes: { 'plant.id': plant.id },
    })
  )
