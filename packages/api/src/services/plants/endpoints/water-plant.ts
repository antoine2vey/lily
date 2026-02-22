import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import type { PlantWaterRequest } from '@lily/shared/plant'
import { Effect } from 'effect'

export const waterPlant = (request: PlantWaterRequest & { id: string }) =>
  executePlantCare({
    plantId: request.id,
    careType: 'watering',
    notes: request.notes,
    date: request.date,
  }).pipe(
    Effect.withSpan('PlantsService.waterPlant', {
      attributes: { 'plant.id': request.id },
    })
  )
