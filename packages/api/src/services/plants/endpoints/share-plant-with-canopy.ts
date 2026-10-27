import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { requireMembership } from '@lily/api/services/canopy/helpers/membership'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import {
  withPlantLimitLock,
  withUserLock,
} from '@lily/api/services/plants/helpers/plant-limit-lock'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reschedule-reminders'
import { interimSettingsUserFor } from '@lily/api/services/plants/helpers/settings-user'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import {
  type MovePlantScopeRequest,
  PlantInDelegationError,
  type PlantOwner,
} from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect, Option, pipe } from 'effect'

export const sharePlantWithCanopy = Effect.fn('PlantsService.shareWithCanopy')(
  function* (plant: PlantWithRoom, request: MovePlantScopeRequest) {
    const { id: userId } = yield* CurrentUser
    const repo = yield* PlantRepository
    const delegationRepo = yield* DelegationRepository
    const limitChecker = yield* LimitChecker

    const membership = yield* requireMembership(userId)
    const canopy: PlantOwner = {
      _tag: 'Canopy',
      canopyId: membership.canopyId,
    }

    const roomId = pipe(Option.fromNullishOr(request.roomId), Option.getOrNull)
    yield* withUserLock(userId)(
      withPlantLimitLock(canopy)(
        Effect.gen(function* () {
          if (yield* delegationRepo.hasOpenDelegationForPlant(plant.id)) {
            return yield* new PlantInDelegationError({ plantId: plant.id })
          }
          yield* assertRoomFits(roomId, canopy)
          if (plant.diedAt === null) {
            yield* limitChecker.checkPlantLimit(canopy)
          }
          const moved = yield* repo.moveTo(
            plant.id,
            plant.owner,
            canopy,
            roomId
          )
          if (moved === null) {
            return yield* new PlantNotFoundError({ plantId: plant.id })
          }
          yield* rescheduleReminders(
            moved,
            yield* interimSettingsUserFor(canopy)
          )
        })
      )
    )

    const fresh = yield* repo.findById(plant.id)
    if (fresh === null) {
      return yield* new PlantNotFoundError({ plantId: plant.id })
    }
    return fresh
  }
)
