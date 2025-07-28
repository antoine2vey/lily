import type { PrismaError, PrismaService } from '@lily/db'
import type { PlantPhoto } from '@lily/shared/plant'
import { Effect } from 'effect'

export const uploadPlantPhoto = (request: {
  plantId: string
}): Effect.Effect<PlantPhoto, PrismaError, PrismaService> =>
  Effect.succeed({
    id: 'placeholder-photo-id',
    url: 'https://placeholder.com/photo.jpg',
    plantId: request.plantId,
    createdAt: new Date(),
  })
