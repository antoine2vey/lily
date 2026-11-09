import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { assertMayUnshare } from '@lily/api/services/plants/helpers/assert-may-unshare'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import { movePlant } from '@lily/api/services/plants/helpers/plant-change'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { MovePlantScopeRequest, PlantOwner } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect, Option, pipe } from 'effect'

export const unsharePlant = Effect.fn('PlantsService.unsharePlant')(function* (
  plant: PlantWithRoom,
  request: MovePlantScopeRequest,
  requestedId: string = plant.id
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* PlantRepository
  const canopyRepo = yield* CanopyRepository
  const limitChecker = yield* LimitChecker
  const me: PlantOwner = { _tag: 'User', userId }
  const roomId = pipe(Option.fromNullishOr(request.roomId), Option.getOrNull)

  yield* movePlant(
    plant,
    requestedId
  )((current, locked) =>
    Effect.gen(function* () {
      if (current.owner._tag !== 'Canopy') {
        return yield* new PlantNotFoundError({ plantId: requestedId })
      }
      yield* assertMayUnshare(current, locked, userId)
      yield* assertRoomFits(roomId, me)
      if (current.diedAt === null) {
        yield* limitChecker.checkPlantLimit(me)
      }
      yield* canopyRepo.deleteMutesForPlant(plant.id)
      const moved = yield* repo.moveTo(current.id, current.owner, me, roomId)
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
})
