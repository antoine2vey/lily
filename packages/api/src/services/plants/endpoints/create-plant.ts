import { EntityMutationDefect } from '@lily/api/errors/defects'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { type LimitExceededError, luxToSliderValue } from '@lily/shared'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { Array, DateTime, Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const createPlant = (
  request: EnhancedPlantCreateRequest
): Effect.Effect<
  Plant,
  SqlError | LimitExceededError,
  | PlantRepository
  | CareScheduleRepository
  | EventBus
  | CurrentUser
  | LimitChecker
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const scheduleRepo = yield* CareScheduleRepository
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker

    yield* Effect.annotateCurrentSpan('plant.name', request.name)

    // Check if user has reached their plant limit
    yield* limitChecker.checkPlantLimit(userId)

    // Set next care dates to now (due immediately)
    const now = DateTime.toDateUtc(DateTime.nowUnsafe())

    const plantOrNull = yield* repo.create({
      name: request.name,
      description: pipe(
        Option.fromNullishOr(request.description),
        Option.getOrNull
      ),
      category: pipe(Option.fromNullishOr(request.category), Option.getOrNull),
      imageUrl: pipe(Option.fromNullishOr(request.imageUrl), Option.getOrNull),
      humidityRating: pipe(
        Option.fromNullishOr(request.humidityRating),
        Option.getOrElse(() => 0)
      ),
      lightingRating: pipe(
        Option.fromNullishOr(request.lightingRating),
        Option.getOrElse(() => luxToSliderValue(request.luxNeeded))
      ),
      petToxicityRating: pipe(
        Option.fromNullishOr(request.petToxicityRating),
        Option.getOrElse(() => 0)
      ),
      wateringRating: pipe(
        Option.fromNullishOr(request.wateringRating),
        Option.getOrElse(() => 0)
      ),
      health: 'HEALTHY',
      potWidthCm: pipe(
        Option.fromNullishOr(request.potWidthCm),
        Option.getOrNull
      ),
      potHeightCm: pipe(
        Option.fromNullishOr(request.potHeightCm),
        Option.getOrNull
      ),
      userId,
      roomId: pipe(Option.fromNullishOr(request.roomId), Option.getOrNull),
    })

    if (!plantOrNull) {
      return yield* Effect.die(
        new EntityMutationDefect({
          message: 'Plant create returned null',
          entity: 'plant',
          operation: 'create',
        })
      )
    }

    const plant = plantOrNull

    // Create schedule rows for the new plant
    yield* scheduleRepo.upsert(plant.id, 'watering', {
      frequencyDays: request.wateringFrequencyDays,
      nextCareAt: now,
    })

    if (request.fertilizationFrequencyDays) {
      yield* scheduleRepo.upsert(plant.id, 'fertilization', {
        frequencyDays: request.fertilizationFrequencyDays,
        nextCareAt: now,
      })
    }

    if (request.mistingFrequencyDays) {
      yield* scheduleRepo.upsert(plant.id, 'misting', {
        frequencyDays: request.mistingFrequencyDays,
        nextCareAt: now,
      })
    }

    if (request.repottingFrequencyDays) {
      yield* scheduleRepo.upsert(plant.id, 'repotting', {
        frequencyDays: request.repottingFrequencyDays,
        nextCareAt: now,
      })
    }

    yield* publishWithRetry(
      eventBus.publish({ _tag: 'PlantCreated', userId, plantId: plant.id })
    )

    // Fetch the created schedules for the response
    const scheduleRows = yield* scheduleRepo.findByPlant(plant.id)
    const schedules = Array.map(scheduleRows, (s) => ({
      careType: s.careType,
      frequencyDays: s.frequencyDays,
      lastCareAt: s.lastCareAt,
      nextCareAt: s.nextCareAt,
    }))

    return {
      ...plant,
      room: null,
      ownership: 'owned' as const,
      ownerName: null,
      schedules,
    }
  }).pipe(Effect.withSpan('PlantsService.createPlant'))
