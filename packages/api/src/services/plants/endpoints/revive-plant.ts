import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { LimitExceededError } from '@lily/shared'
import {
  PlantNotDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Array, DateTime, Effect } from 'effect'

/**
 * "Bring back": clear the death columns and rebuild reminders from the
 * schedule rows that survived burial. Only future due dates get a reminder;
 * past ones are left for the overdue scheduler, so a neglected plant comes
 * back overdue rather than magically fresh.
 */
export const revivePlant = (
  plant: PlantWithRoom
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
> =>
  Effect.gen(function* () {
    if (plant.diedAt === null) {
      return yield* new PlantNotDeadError()
    }

    const repo = yield* PlantRepository
    const scheduleRepo = yield* CareScheduleRepository
    const limitChecker = yield* LimitChecker
    const eventBus = yield* EventBus

    // A revived plant takes a slot again; free users at the cap are paywalled
    // exactly like on create, so bury-then-revive is not a way around it.
    yield* limitChecker.checkPlantLimit(plant.userId)

    const updated = yield* repo.revive(plant.id)
    if (!updated) {
      return yield* new PlantNotFoundError({ plantId: plant.id })
    }

    const schedules = yield* scheduleRepo.findByPlant(plant.id)
    const nowMs = DateTime.toEpochMillis(DateTime.unsafeNow())
    yield* Effect.forEach(
      Array.filter(
        schedules,
        (schedule) =>
          schedule.nextCareAt !== null &&
          DateTime.toEpochMillis(DateTime.unsafeMake(schedule.nextCareAt)) >
            nowMs
      ),
      (schedule) =>
        scheduleCareReminder({
          plantId: plant.id,
          userId: plant.userId,
          type: `${schedule.careType}_reminder` as const,
          // biome-ignore lint/style/noNonNullAssertion: filtered non-null above
          scheduledDate: schedule.nextCareAt!,
          remindersEnabled: updated.remindersEnabled,
        })
    )

    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'PlantLifecycleChanged',
        userId: plant.userId,
        plantId: plant.id,
      })
    )

    const fresh = yield* repo.findById(plant.id)
    if (!fresh) {
      return yield* new PlantNotFoundError({ plantId: plant.id })
    }
    return fresh
  }).pipe(
    Effect.withSpan('PlantsService.revivePlant', {
      attributes: { 'plant.id': plant.id },
    })
  )
