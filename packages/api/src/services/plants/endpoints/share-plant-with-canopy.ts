import { Canopy } from '@lily/api/contexts/canopy'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import {
  type MovePlantScopeRequest,
  PlantInDelegationError,
} from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect, Option } from 'effect'

export const sharePlantWithCanopy = Effect.fn('PlantsService.shareWithCanopy')(
  function* (
    permit: PlantPermit<'share'>,
    request: MovePlantScopeRequest,
    requestedId: string = permit.plantId
  ) {
    const canopy = yield* Canopy
    const repo = yield* PlantRepository
    yield* canopy
      .sharePlant({ permit, roomId: Option.fromNullishOr(request.roomId) })
      .pipe(
        Effect.catchTags({
          PlantNotFoundError: () =>
            Effect.fail(new PlantNotFoundError({ plantId: requestedId })),
          PlantInDelegationError: () =>
            Effect.fail(new PlantInDelegationError({ plantId: requestedId })),
        })
      )

    const fresh = yield* repo.findById(permit.plantId)
    if (fresh === null) {
      return yield* new PlantNotFoundError({ plantId: requestedId })
    }
    return fresh
  }
)
