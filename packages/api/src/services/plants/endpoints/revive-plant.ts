import { EventBus, publishWithRetry } from '@lily/api/events'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { RecipientRepository } from '@lily/api/repositories/recipient.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { changePlant } from '@lily/api/services/plants/helpers/plant-change'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { LimitExceededError } from '@lily/shared'
import {
  PlantNotDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
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
  | RecipientRepository
  | LimitChecker
  | EventBus
  | CurrentUser
  | SqlClient.SqlClient
  | CanopyRepository
> =>
  Effect.gen(function* () {
    if (plant.diedAt === null) {
      return yield* new PlantNotDeadError()
    }

    const repo = yield* PlantRepository
    const limitChecker = yield* LimitChecker
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser

    // A revived plant takes a slot again; free users at the cap are paywalled
    // exactly like on create, so bury-then-revive is not a way around it.
    yield* changePlant(
      plant,
      requestedId
    )((current) =>
      Effect.gen(function* () {
        if (current.diedAt === null) {
          return yield* new PlantNotDeadError()
        }
        yield* limitChecker.checkPlantLimit(current.owner)
        const updated = yield* repo.revive(current.id, current.owner)
        if (!updated) {
          return yield* new PlantNotFoundError({ plantId: requestedId })
        }
        yield* rescheduleReminders([updated.id])
      })
    )

    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'PlantLifecycleChanged',
        userId,
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
