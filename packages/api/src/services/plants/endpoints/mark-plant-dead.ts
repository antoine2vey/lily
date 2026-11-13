import { PlantLife } from '@lily/api/contexts/care'
import type { PlantPermit } from '@lily/api/kernel/permit'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import {
  type PlantAlreadyDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { PlantDeathRequest } from '@lily/shared/plant'
import { Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const markPlantDead = (
  plant: PlantWithRoom,
  permit: PlantPermit<'markDead'>,
  request: PlantDeathRequest,
  requestedId: string = plant.id
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError | PlantAlreadyDeadError,
  PlantRepository | PlantLife
> =>
  Effect.gen(function* () {
    const life = yield* PlantLife
    const repo = yield* PlantRepository

    yield* life
      .bury({
        permit,
        seenOwner: plant.owner,
        cause: request.cause,
        note: Option.fromNullishOr(request.note),
      })
      .pipe(
        Effect.catchTag('PlantNotFoundError', () =>
          Effect.fail(new PlantNotFoundError({ plantId: requestedId }))
        )
      )

    const fresh = yield* repo.findById(plant.id)
    if (!fresh) {
      return yield* new PlantNotFoundError({ plantId: requestedId })
    }
    return fresh
  }).pipe(
    Effect.withSpan('PlantsService.markPlantDead', {
      attributes: { 'plant.id': plant.id, 'plant.death_cause': request.cause },
    })
  )
