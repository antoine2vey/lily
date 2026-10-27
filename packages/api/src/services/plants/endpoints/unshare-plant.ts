import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import { withOwnerLock } from '@lily/api/services/plants/helpers/owner-lock'
import { reloadOwnedPlant } from '@lily/api/services/plants/helpers/reload-owned-plant'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reschedule-reminders'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import {
  CanopyNotFoundError,
  type MovePlantScopeRequest,
  type PlantOwner,
} from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect, Option, pipe } from 'effect'

export const unsharePlant = Effect.fn('PlantsService.unsharePlant')(function* (
  plant: PlantWithRoom,
  request: MovePlantScopeRequest
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* PlantRepository
  const canopyRepo = yield* CanopyRepository
  const limitChecker = yield* LimitChecker
  const me: PlantOwner = { _tag: 'User', userId }
  const roomId = pipe(Option.fromNullishOr(request.roomId), Option.getOrNull)

  yield* withOwnerLock(me)(
    Effect.gen(function* () {
      const { canopy } = yield* lockMyCanopy(userId)
      if (plant.owner._tag !== 'Canopy' || plant.owner.canopyId !== canopy.id) {
        return yield* new CanopyNotFoundError()
      }
      const current = yield* reloadOwnedPlant(plant)
      yield* assertRoomFits(roomId, me)
      if (current.diedAt === null) {
        yield* limitChecker.checkPlantLimit(me)
      }
      yield* canopyRepo.deleteMutesForPlant(plant.id)
      const moved = yield* repo.moveTo(plant.id, plant.owner, me, roomId)
      if (moved === null) {
        return yield* new PlantNotFoundError({ plantId: plant.id })
      }
      yield* rescheduleReminders(moved, userId)
    })
  )

  const fresh = yield* repo.findById(plant.id)
  if (fresh === null) {
    return yield* new PlantNotFoundError({ plantId: plant.id })
  }
  return fresh
})
