import type { Canopy } from '@lily/api/contexts/canopy'
import { PlantLife } from '@lily/api/contexts/care'
import { EntityMutationDefect } from '@lily/api/errors/defects'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { RoomRepository } from '@lily/api/repositories/room.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import {
  canopyOwnerOf,
  withOwnerLock,
} from '@lily/api/services/plants/helpers/owner-lock'
import { frequencyChanges } from '@lily/api/services/plants/helpers/schedule-frequencies'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { RoomNotFoundError } from '@lily/shared'
import {
  type CanopyNotFoundError,
  type LimitExceededError,
  luxToSliderValue,
  type PlantOwner,
} from '@lily/shared'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { Effect, Option, pipe } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const createPlant = (
  request: EnhancedPlantCreateRequest
): Effect.Effect<
  Plant,
  SqlError | LimitExceededError | RoomNotFoundError | CanopyNotFoundError,
  | PlantRepository
  | CanopyRepository
  | Canopy
  | RoomRepository
  | PlantLife
  | CurrentUser
  | LimitChecker
  | SqlClient.SqlClient
  | Outbox
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const life = yield* PlantLife
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker

    yield* Effect.annotateCurrentSpan('plant.name', request.name)

    const owner: PlantOwner =
      request.owner === 'canopy'
        ? yield* canopyOwnerOf(userId)
        : { _tag: 'User', userId }

    const { plantId } = yield* withOwnerLock(owner)((held) =>
      Effect.gen(function* () {
        yield* assertRoomFits(request.roomId, owner)
        yield* limitChecker.checkPlantLimit(owner)
        return yield* life.plant({
          held,
          by: userId,
          draft: {
            name: request.name,
            description: Option.fromNullishOr(request.description),
            category: Option.fromNullishOr(request.category),
            imageUrl: Option.fromNullishOr(request.imageUrl),
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
            potWidthCm: Option.fromNullishOr(request.potWidthCm),
            potHeightCm: Option.fromNullishOr(request.potHeightCm),
            roomId: Option.fromNullishOr(request.roomId),
          },
          frequencies: frequencyChanges({
            wateringFrequencyDays: request.wateringFrequencyDays,
            fertilizationFrequencyDays:
              request.fertilizationFrequencyDays || undefined,
            mistingFrequencyDays: request.mistingFrequencyDays || undefined,
            repottingFrequencyDays: request.repottingFrequencyDays || undefined,
          }),
        })
      })
    )

    const created = yield* repo.findById(plantId)
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
