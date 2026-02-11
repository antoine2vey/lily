import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import { Effect } from 'effect'

export const fertilizePlant = (request: { id: string }) =>
  executePlantCare({
    plantId: request.id,
    careType: 'fertilization',
  }).pipe(
    Effect.withSpan('PlantsService.fertilizePlant', {
      attributes: { 'plant.id': request.id },
    })
  )
