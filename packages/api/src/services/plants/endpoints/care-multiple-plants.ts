import { Care, CareWhen, PlanStepChoice } from '@lily/api/contexts/care'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { plantPermits } from '@lily/api/services/plants/helpers/with-plant-access'
import type {
  CareMultiplePlantsRequest,
  CareMultiplePlantsResult,
} from '@lily/shared/plant'
import { Array, Effect, Option, pipe } from 'effect'

export const careMultiplePlants = (request: CareMultiplePlantsRequest) =>
  Effect.gen(function* () {
    const care = yield* Care
    const plants = yield* PlantRepository

    const outcomes = yield* care.record({
      permits: yield* plantPermits(request.plantIds, 'care'),
      careType: request.careType,
      on: CareWhen.Today(),
      notes: Option.none(),
      photoUrl: Option.none(),
      planStep: PlanStepChoice.Auto(),
    })
    const recorded = Array.filter(
      outcomes,
      (outcome) => outcome._tag === 'Recorded'
    )
    const cared = yield* Effect.forEach(recorded, ({ plantId }) =>
      plants.findById(plantId)
    )

    return Array.map(
      request.plantIds,
      (plantId): CareMultiplePlantsResult =>
        pipe(
          Array.findFirst(cared, (plant) => plant?.id === plantId),
          Option.flatMap(Option.fromNullishOr),
          Option.match({
            onNone: () => ({ plantId, success: false }),
            onSome: (plant) => ({ plantId, success: true, plant }),
          })
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
