import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import type { PlantFertilizeRequest } from '@lily/shared/plant'
import { Effect } from 'effect'

export const fertilizePlant = (
  request: PlantFertilizeRequest & { id: string }
) =>
  executePlantCare({
    plantId: request.id,
    careType: 'fertilization',
    date: request.date,
  }).pipe(
    Effect.withSpan('PlantsService.fertilizePlant', {
      attributes: { 'plant.id': request.id },
    })
  )
