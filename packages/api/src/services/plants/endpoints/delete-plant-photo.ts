import { type PrismaError, PrismaService } from '@lily/db'
import { Effect } from 'effect'

export const deletePlantPhoto = ({
  plantId,
  photoId,
}: {
  plantId: string
  photoId: string
}): Effect.Effect<void, PrismaError, PrismaService> => {
  return Effect.gen(function* () {
    const prisma = yield* PrismaService

    yield* prisma.plantPhoto.delete({
      where: { id: photoId, plantId },
    })

    return yield* Effect.void
  })
}
