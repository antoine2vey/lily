import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import {
  type ReminderPlant,
  reminderRecipients,
} from '@lily/api/services/plants/helpers/reminder-recipients'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { Array, DateTime, Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export interface ReschedulablePlant extends ReminderPlant {
  readonly remindersEnabled: boolean
  readonly diedAt: Date | null
}

export const rescheduleReminders = (
  plant: ReschedulablePlant
): Effect.Effect<
  void,
  SqlError,
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | CanopyRepository
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const scheduleRepo = yield* CareScheduleRepository

    yield* notificationRepo.deleteForReschedule(
      plant.id,
      yield* reminderRecipients(plant)
    )
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
          plant,
          type: `${schedule.careType}_reminder` as const,
          scheduledDate: schedule.nextCareAt,
        })
    )
  }).pipe(
    Effect.withSpan('rescheduleReminders', {
      attributes: { 'plant.id': plant.id },
    })
  )
