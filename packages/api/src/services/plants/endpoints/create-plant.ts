import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import type { EnhancedPlantCreateRequest } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect } from 'effect'
import { transformPlant } from '../utils'

export const createPlant = (request: EnhancedPlantCreateRequest) =>
  Effect.gen(function* () {
    const db = yield* Database

    const rawPlant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.create({
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
        }),
      catch: () => new DatabaseError(),
    })

    return transformPlant(rawPlant)
  })
