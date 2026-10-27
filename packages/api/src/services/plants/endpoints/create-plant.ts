import { EntityMutationDefect } from '@lily/api/errors/defects'
import { EventBus, publishWithRetry } from '@lily/api/events'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { RoomRepository } from '@lily/api/repositories/room.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { requireMembership } from '@lily/api/services/canopy/helpers/membership'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import { withPlantLimitLock } from '@lily/api/services/plants/helpers/plant-limit-lock'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { RoomNotFoundError } from '@lily/shared'
import {
  type CanopyId,
  CanopyNotFoundError,
  type LimitExceededError,
  luxToSliderValue,
  type PlantOwner,
} from '@lily/shared'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { DateTime, Effect, Option, pipe } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const createPlant = (
  request: EnhancedPlantCreateRequest
): Effect.Effect<
  Plant,
  SqlError | LimitExceededError | RoomNotFoundError | CanopyNotFoundError,
  | PlantRepository
  | CanopyRepository
  | RoomRepository
  | CareScheduleRepository
  | EventBus
  | CurrentUser
  | LimitChecker
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const scheduleRepo = yield* CareScheduleRepository
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker

    yield* Effect.annotateCurrentSpan('plant.name', request.name)

    const owner: PlantOwner =
      request.owner === 'canopy'
        ? {
            _tag: 'Canopy',
            canopyId: (yield* requireMembership(userId)).canopyId as CanopyId,
          }
        : { _tag: 'User', userId }

    // Set next care dates to now (due immediately)
    const now = DateTime.toDateUtc(DateTime.nowUnsafe())

    const plantOrNull = yield* withPlantLimitLock(owner)(
      Effect.gen(function* () {
        if (owner._tag === 'Canopy') {
          const current = yield* requireMembership(userId)
          if (current.canopyId !== owner.canopyId) {
            return yield* new CanopyNotFoundError()
          }
        }
        yield* assertRoomFits(request.roomId, owner)
        yield* limitChecker.checkPlantLimit(owner)
        return yield* repo.create({
          name: request.name,
          description: pipe(
            Option.fromNullishOr(request.description),
            Option.getOrNull
          ),
          category: pipe(
            Option.fromNullishOr(request.category),
            Option.getOrNull
          ),
          imageUrl: pipe(
            Option.fromNullishOr(request.imageUrl),
            Option.getOrNull
          ),
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
          owner,
          createdByUserId: userId,
          roomId: pipe(Option.fromNullishOr(request.roomId), Option.getOrNull),
        })
      })
    )

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

    const created = yield* repo.findById(plant.id)
    if (!created) {
      return yield* Effect.die(
        new EntityMutationDefect({
          message: 'Created plant not found',
          entity: 'plant',
          operation: 'create',
        })
      )
    }
    return created
  }).pipe(Effect.withSpan('PlantsService.createPlant'))
