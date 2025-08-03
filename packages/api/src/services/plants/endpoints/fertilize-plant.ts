import { type PrismaError, PrismaService } from '@lily/db'
import type { Plant } from '@lily/shared/plant'
import { Effect } from 'effect'

export const fertilizePlant = (request: {
  id: string
}): Effect.Effect<Plant, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    const plant = yield* prisma.plant.update({
      where: { id: request.id },
      data: {
        lastFertilizedAt: new Date(),
      },
    })

    return plant
  })
