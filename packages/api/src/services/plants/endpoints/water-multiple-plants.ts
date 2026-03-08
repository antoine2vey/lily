import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import type {
  WaterMultiplePlantsRequest,
  WaterMultiplePlantsResponse,
} from '@lily/shared/plant'
import { Effect } from 'effect'

export const waterMultiplePlants = (
  request: WaterMultiplePlantsRequest
): Effect.Effect<
  WaterMultiplePlantsResponse,
  Effect.Effect.Error<ReturnType<typeof careMultiplePlants>>,
  Effect.Effect.Context<ReturnType<typeof careMultiplePlants>>
> =>
  careMultiplePlants({
    plantIds: request.plantIds,
    careType: 'watering',
  }).pipe(
    Effect.withSpan('PlantsService.waterMultiplePlants', {
      attributes: { 'plant.count': request.plantIds.length },
    })
  )
