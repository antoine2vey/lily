import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { LimitExceededError } from '@lily/shared'
import { DatabaseError } from '@lily/shared/errors/database'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { Effect, Option, pipe } from 'effect'

export const createPlant = (
  request: EnhancedPlantCreateRequest
): Effect.Effect<
  Plant,
  SqlError | DatabaseError | LimitExceededError,
  PlantRepository | EventBus | CurrentUser | LimitChecker
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker

    // Check if user has reached their plant limit
    yield* limitChecker.checkPlantLimit(userId)

    const plant = yield* repo.create({
      name: request.name,
      description: request.description || null,
      category: request.category || null,
      humidityRating: request.humidityRating || 0,
      lightingRating: 0, // Default value
      petToxicityRating: pipe(
        Option.fromNullable(request.petToxicityRating),
        Option.getOrElse(() => 0)
      ),
      wateringRating: 0, // Default value
      wateringFrequencyDays: request.wateringFrequencyDays,
      fertilizationFrequencyDays: request.fertilizationFrequencyDays ?? null,
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
