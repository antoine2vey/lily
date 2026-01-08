import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { DatabaseError } from '@lily/shared/errors/database'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { Effect } from 'effect'

// TODO: Get real userId from Auth service when auth is integrated
const TEMP_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

export const createPlant = (
  request: EnhancedPlantCreateRequest
): Effect.Effect<Plant, SqlError | DatabaseError, PlantRepository | EventBus> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const eventBus = yield* EventBus
    const userId = TEMP_USER_ID

    const plant = yield* repo.create({
      name: request.name,
      description: request.description || null,
      category: request.category || null,
      humidityRating: request.humidityRating || 0,
      lightingRating: 0, // Default value
      petToxicityRating: request.petToxicityRating ?? 0,
      wateringRating: 0, // Default value
      wateringFrequencyDays: request.wateringFrequencyDays,
      health: 'HEALTHY', // Default value
      userId,
    })

    if (!plant) {
      return yield* Effect.fail(new DatabaseError())
    }

    yield* publishWithRetry(
      eventBus.publish({ _tag: 'PlantCreated', userId, plantId: plant.id })
    )

    return plant
  })
