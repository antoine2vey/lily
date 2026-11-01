import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { withOwnerLock } from '@lily/api/services/plants/helpers/owner-lock'
import { rebuildMemberReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { reloadOwnedPlant } from '@lily/api/services/plants/helpers/reload-owned-plant'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const mutePlant = Effect.fn('PlantsService.mutePlant')(function* (
  plant: PlantWithRoom,
  requestedId: string = plant.id
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  const notificationRepo = yield* NotificationRepository
  yield* withOwnerLock(plant.owner)(
    withReminderKeys(reminderKeysFor([plant.id]))(
      Effect.andThen(
        reloadOwnedPlant(plant, requestedId),
        Effect.andThen(
          repo.mute(userId, plant.id),
          notificationRepo.deleteUndeliveredByUserAndPlant(userId, plant.id)
        )
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
  yield* withReminderKeys(reminderKeysFor([plant.id]))(
    Effect.andThen(
      repo.unmute(userId, plant.id),
      rebuildMemberReminders(userId, [plant.id])
    )
  )
})

// Muting is per member, so only the caller's own state is reported, and only
// on Canopy plants.
export const withMuteState = <P extends PlantWithRoom>(
  plant: P
): Effect.Effect<
  P & { readonly muted?: boolean },
  SqlError,
  CurrentUser | CanopyRepository
> =>
  Effect.gen(function* () {
    if (plant.ownership !== 'canopy') return plant
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository
    return { ...plant, muted: yield* repo.isMuted(userId, plant.id) }
  }).pipe(Effect.withSpan('PlantsService.withMuteState'))
