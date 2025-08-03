import { type PrismaError, PrismaService } from '@lily/db'
import type { Plant } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect } from 'effect'
import type { PlantByIdRequest } from '../utils'

export const findPlantById = ({
  id,
}: PlantByIdRequest): Effect.Effect<Plant, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    const plant = yield* prisma.plant.findUniqueOrThrow({
      where: { id },
      select: plantSelector,
    })

    return plant
  })
