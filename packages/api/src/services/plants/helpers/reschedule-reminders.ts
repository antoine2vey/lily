import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { Array, DateTime, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface ReschedulablePlant {
  readonly id: string
  readonly remindersEnabled: boolean
  readonly diedAt: Date | null
}

/**
 * Drops the plant's pending notifications and rebuilds a reminder for every
 * schedule that falls due in the future, for `userId`. Past due dates are
 * left to the overdue scheduler, and a dead plant gets no reminder.
 */
export const rescheduleReminders = (
  plant: ReschedulablePlant,
  userId: string
): Effect.Effect<
  void,
  SqlError,
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
> =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const scheduleRepo = yield* CareScheduleRepository

    yield* notificationRepo.deletePendingByPlantId(plant.id)
    if (plant.diedAt !== null) {
      return
    }

    const schedules = yield* scheduleRepo.findByPlant(plant.id)
    const nowMs = DateTime.toEpochMillis(DateTime.nowUnsafe())
    yield* Effect.forEach(
      Array.filter(
        schedules,
        (schedule): schedule is typeof schedule & { nextCareAt: Date } =>
          schedule.nextCareAt !== null && schedule.nextCareAt.getTime() > nowMs
      ),
      (schedule) =>
        scheduleCareReminder({
          plantId: plant.id,
          userId,
          type: `${schedule.careType}_reminder` as const,
          scheduledDate: schedule.nextCareAt,
          remindersEnabled: plant.remindersEnabled,
        })
    )
  }).pipe(
    Effect.withSpan('rescheduleReminders', {
      attributes: { 'plant.id': plant.id },
    })
  )
