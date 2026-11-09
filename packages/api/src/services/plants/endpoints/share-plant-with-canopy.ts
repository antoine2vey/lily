import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import { movePlant } from '@lily/api/services/plants/helpers/plant-change'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import {
  type MovePlantScopeRequest,
  PlantInDelegationError,
  type PlantOwner,
} from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect, Option, pipe } from 'effect'

export const sharePlantWithCanopy = Effect.fn('PlantsService.shareWithCanopy')(
  function* (
    plant: PlantWithRoom,
    request: MovePlantScopeRequest,
    requestedId: string = plant.id
  ) {
    const repo = yield* PlantRepository
    const delegationRepo = yield* DelegationRepository
    const limitChecker = yield* LimitChecker
    const roomId = pipe(Option.fromNullishOr(request.roomId), Option.getOrNull)

    yield* movePlant(
      plant,
      requestedId
    )((current, { membership: { canopyId } }) =>
      Effect.gen(function* () {
        const canopy: PlantOwner = { _tag: 'Canopy', canopyId }
        if (yield* delegationRepo.hasOpenDelegationForPlant(plant.id)) {
          return yield* new PlantInDelegationError({ plantId: requestedId })
        }
        yield* assertRoomFits(roomId, canopy)
        if (current.diedAt === null) {
          yield* limitChecker.checkPlantLimit(canopy)
        }
        const moved = yield* repo.moveTo(
          current.id,
          current.owner,
          canopy,
          roomId
        )
        if (moved === null) {
          return yield* new PlantNotFoundError({ plantId: requestedId })
        }
        yield* rescheduleReminders([moved.id])
      })
    )

    const fresh = yield* repo.findById(plant.id)
    if (fresh === null) {
      return yield* new PlantNotFoundError({ plantId: requestedId })
    }
    return fresh
  }
)
