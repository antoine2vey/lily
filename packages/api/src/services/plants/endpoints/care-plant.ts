import { Care, careWhenOf, PlanStepChoice } from '@lily/api/contexts/care'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { PlantCareRequest } from '@lily/shared/plant'
import { Effect, Option } from 'effect'

export const carePlant = (
  permit: PlantPermit<'care'>,
  request: PlantCareRequest
) =>
  Effect.gen(function* () {
    const care = yield* Care
    const plants = yield* PlantRepository
    yield* care.recordOne({
      permit,
      careType: request.careType,
      on: careWhenOf(request.date),
      notes: Option.fromNullishOr(request.notes),
      photoUrl: Option.none(),
      planStep: PlanStepChoice.Auto(),
    })
    const plant = yield* plants.findById(permit.plantId)
    return yield* Option.match(Option.fromNullishOr(plant), {
      onNone: () =>
        Effect.fail(new PlantNotFoundError({ plantId: permit.plantId })),
      onSome: Effect.succeed,
    })
  }).pipe(
    Effect.withSpan('PlantsService.carePlant', {
      attributes: {
        'plant.id': permit.plantId,
        'care.type': request.careType,
      },
    })
  )
