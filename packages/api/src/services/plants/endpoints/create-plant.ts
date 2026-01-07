import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { DatabaseError } from '@lily/shared/errors/database'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { Effect } from 'effect'
import { transformPlant } from '../utils'

export const createPlant = (
  request: EnhancedPlantCreateRequest
): Effect.Effect<Plant, SqlError | DatabaseError, PlantRepository> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository

    const rawPlant = yield* repo.create({
      name: request.name,
      description: request.description || null,
      category: request.category || null,
      humidityRating: request.humidityRating || 0,
      lightingRating: 0, // Default value
      petToxicityRating: request.petToxicityRating ?? 0,
      wateringRating: 0, // Default value
      wateringFrequencyDays: request.wateringFrequencyDays,
      health: 'HEALTHY', // Default value
      userId: 'placeholder', // TODO: Get from context
    })

    if (!rawPlant) {
      return yield* Effect.fail(new DatabaseError())
    }

    return transformPlant(rawPlant)
  })
