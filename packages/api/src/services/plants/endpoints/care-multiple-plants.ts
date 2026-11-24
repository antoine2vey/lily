import { Care, CareWhen, PlanStepChoice } from '@lily/api/contexts/care'
import { transact } from '@lily/api/kernel/transact'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { plantPermits } from '@lily/api/services/plants/helpers/with-plant-access'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type {
  CareMultiplePlantsRequest,
  CareMultiplePlantsResult,
} from '@lily/shared/plant'
import { Array, Effect, Option } from 'effect'

export const careMultiplePlants = (request: CareMultiplePlantsRequest) =>
  Effect.gen(function* () {
    const care = yield* Care
    const plants = yield* PlantRepository
    const permits = yield* plantPermits(request.plantIds, 'care')

    const cared = yield* transact(
      Effect.gen(function* () {
        const outcomes = yield* care.record({
          permits,
          careType: request.careType,
          on: CareWhen.Today(),
          notes: Option.none(),
          photoUrl: Option.none(),
          planStep: PlanStepChoice.Auto(),
        })
        const recorded = Array.map(
          Array.filter(outcomes, (outcome) => outcome._tag === 'Recorded'),
          (outcome) => outcome.plantId
        )
        const read = yield* plants.findWithRoomByIds(recorded)
        return yield* Effect.forEach(recorded, (plantId) =>
          Effect.fromOption(
            Array.findFirst(read, (plant) => plant.id === plantId),
            () => new PlantNotFoundError({ plantId })
          )
        )
      })
    )

    return Array.map(
      request.plantIds,
      (plantId): CareMultiplePlantsResult =>
        Option.match(
          Array.findFirst(cared, (plant) => plant.id === plantId),
          {
            onNone: () => ({ plantId, success: false }),
            onSome: (plant) => ({ plantId, success: true, plant }),
          }
        )
    )
  }).pipe(
    Effect.withSpan('PlantsService.careMultiplePlants', {
      attributes: {
        'plant.count': request.plantIds.length,
        'care.type': request.careType,
      },
    })
  )
