import { type PrismaError, PrismaService } from '@lily/db'
import type { Plant } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect } from 'effect'
import { type PlantDeleteRequest, transformPlant } from '../utils'

export const deletePlant = (
  request: PlantDeleteRequest
): Effect.Effect<Plant, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    const rawPlant = yield* prisma.plant.delete({
      where: { id: request.id },
      select: plantSelector,
    })

    return transformPlant(rawPlant)
  })
