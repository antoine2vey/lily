import { Canopy } from '@lily/api/contexts/canopy'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { MovePlantScopeRequest } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect, Option } from 'effect'

export const unsharePlant = Effect.fn('PlantsService.unsharePlant')(function* (
  permit: PlantPermit<'unshare'>,
  request: MovePlantScopeRequest,
  requestedId: string = permit.plantId
) {
  const canopy = yield* Canopy
  const repo = yield* PlantRepository
  return yield* transact(
    Effect.gen(function* () {
      yield* canopy
        .unsharePlant({ permit, roomId: Option.fromNullishOr(request.roomId) })
        .pipe(
          Effect.catchTag('PlantNotFoundError', () =>
            Effect.fail(new PlantNotFoundError({ plantId: requestedId }))
          )
        )
      const fresh = yield* repo.findById(permit.plantId)
      if (fresh === null) {
        return yield* new PlantNotFoundError({ plantId: requestedId })
      }
      return fresh
    })
  )
})
