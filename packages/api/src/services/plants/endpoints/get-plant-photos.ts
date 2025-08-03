import { type PrismaError, PrismaService } from '@lily/db'
import type { PlantPhoto } from '@lily/shared/plant'
import { Effect } from 'effect'

export const getPlantPhotos = ({
  plantId,
}: {
  plantId: string
}): Effect.Effect<PlantPhoto[], PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    return yield* prisma.plantPhoto.findMany({
      where: { plantId },
    })
  })
