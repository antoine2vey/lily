import { EventBus, publishWithRetry } from '@lily/api/events'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reschedule-reminders'
import { interimSettingsUserFor } from '@lily/api/services/plants/helpers/settings-user'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { LimitExceededError } from '@lily/shared'
import {
  PlantNotDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * "Bring back": clear the death columns and rebuild reminders from the
 * schedule rows that survived burial. Only future due dates get a reminder;
 * past ones are left for the overdue scheduler, so a neglected plant comes
 * back overdue rather than magically fresh.
 */
export const revivePlant = (
  plant: PlantWithRoom,
  requestedId: string = plant.id
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError | PlantNotDeadError | LimitExceededError,
  | PlantRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | LimitChecker
  | EventBus
  | CurrentUser
> =>
  Effect.gen(function* () {
    if (plant.diedAt === null) {
      return yield* new PlantNotDeadError()
    }

    const repo = yield* PlantRepository
    const limitChecker = yield* LimitChecker
    const eventBus = yield* EventBus

    // A revived plant takes a slot again; free users at the cap are paywalled
    // exactly like on create, so bury-then-revive is not a way around it.
    yield* limitChecker.checkPlantLimit(plant.owner)
    const settingsUserId = yield* interimSettingsUserFor(plant.owner)

    const updated = yield* repo.revive(plant.id, plant.owner)
    if (!updated) {
      return yield* new PlantNotFoundError({ plantId: requestedId })
    }

    yield* rescheduleReminders(updated, settingsUserId)

    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'PlantLifecycleChanged',
        userId: settingsUserId,
        plantId: plant.id,
      })
    )

    const fresh = yield* repo.findById(plant.id)
    if (!fresh) {
      return yield* new PlantNotFoundError({ plantId: requestedId })
    }
    return fresh
  }).pipe(
    Effect.withSpan('PlantsService.revivePlant', {
      attributes: { 'plant.id': plant.id },
    })
  )
