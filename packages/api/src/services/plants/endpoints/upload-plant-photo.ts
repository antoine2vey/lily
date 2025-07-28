import type { PlantPhoto } from '@lily/shared/plant'
import { Effect } from 'effect'

export const uploadPlantPhoto = (request: { plantId: string }) =>
  Effect.succeed({
    id: 'placeholder-photo-id',
    url: 'https://placeholder.com/photo.jpg',
    plantId: request.plantId,
    createdAt: new Date(),
  } satisfies PlantPhoto)
