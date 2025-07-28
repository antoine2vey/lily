import type { PrismaError, PrismaService } from '@lily/db'
import type { PlantPhoto } from '@lily/shared/plant'
import { Effect } from 'effect'

export const getPlantPhotos = (_request: {
  plantId: string
}): Effect.Effect<PlantPhoto[], PrismaError, PrismaService> =>
  Effect.succeed([])
