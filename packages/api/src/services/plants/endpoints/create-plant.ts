import { type PrismaError, PrismaService } from '@lily/db'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect } from 'effect'
import { transformPlant } from '../utils'

export const createPlant = (
  request: EnhancedPlantCreateRequest
): Effect.Effect<Plant, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    const rawPlant = yield* prisma.plant.create({
      data: {
        name: request.name,
        description: request.description || null,
        category: request.category || null,
        humidityRating: request.humidityRating || 0,
        lightingRating: 0, // Default value
        petToxicityRating: request.petToxicityRating,
        wateringRating: 0, // Default value
        wateringFrequencyDays: request.wateringFrequencyDays,
        health: 'HEALTHY', // Default value
        userId: 'placeholder', // TODO: Get from context
      },
      select: plantSelector,
    })

    return transformPlant(rawPlant)
  })
