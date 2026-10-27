import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { withOwnerLock } from '@lily/api/services/plants/helpers/owner-lock'
import { reloadOwnedPlant } from '@lily/api/services/plants/helpers/reload-owned-plant'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reschedule-reminders'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'

export const mutePlant = Effect.fn('PlantsService.mutePlant')(function* (
  plant: PlantWithRoom,
  requestedId: string = plant.id
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  const notificationRepo = yield* NotificationRepository
  yield* withOwnerLock(plant.owner)(
    Effect.andThen(
      reloadOwnedPlant(plant, requestedId),
      Effect.andThen(
        repo.mute(userId, plant.id),
        notificationRepo.deletePendingByUserAndPlant(userId, plant.id)
      )
    )
  ).pipe(
    Effect.catchTag('CanopyNotFoundError', () =>
      Effect.fail(new PlantNotFoundError({ plantId: requestedId }))
    )
  )
})

export const unmutePlant = Effect.fn('PlantsService.unmutePlant')(function* (
  plant: PlantWithRoom
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  yield* repo.unmute(userId, plant.id)
  yield* rescheduleReminders(plant)
})
