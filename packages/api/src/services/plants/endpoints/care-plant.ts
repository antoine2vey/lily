import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import type { PlantCareRequest } from '@lily/shared/plant'
import { Effect } from 'effect'

export const carePlant = (
  plant: PlantWithRoom,
  request: PlantCareRequest & { id: string }
) =>
  executePlantCare(plant, {
    plantId: request.id,
    careType: request.careType,
    notes: request.notes,
    date: request.date,
  }).pipe(
    Effect.withSpan('PlantsService.carePlant', {
      attributes: {
        'plant.id': request.id,
        'care.type': request.careType,
      },
    })
  )
