import { type PrismaError, PrismaService } from '@lily/db'
import type { Plant, PlantUpdateRequest } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect, pipe, Record } from 'effect'
import { transformPlant } from '../utils'

export const updatePlant = (
  request: PlantUpdateRequest & { id: string }
): Effect.Effect<Plant, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    const data = pipe(
      Object.entries(request),
      Record.fromEntries,
      Record.remove('id'),
      Record.filter((_, value) => value !== undefined)
    )

    const rawPlant = yield* prisma.plant.update({
      where: { id: request.id },
      data,
      select: plantSelector,
    })

    return transformPlant(rawPlant)
  })
