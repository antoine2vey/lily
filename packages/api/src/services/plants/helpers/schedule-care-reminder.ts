import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleDeferredCareNotification } from '@lily/api/services/helpers/schedule-notification'
import {
  adjustForDoNotDisturb,
  calculateScheduledAt,
} from '@lily/api/services/notifications/timezone-scheduler'
import {
  type ReminderPlant,
  reminderRecipients,
} from '@lily/api/services/plants/helpers/reminder-recipients'
import { getUserNotificationSettings } from '@lily/api/services/plants/helpers/user-settings'
import { isOnVacation, nowAsDate } from '@lily/shared'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export type CareReminderType =
  | 'watering_reminder'
  | 'fertilization_reminder'
  | 'misting_reminder'
  | 'repotting_reminder'

export interface ScheduleCareReminderParams {
  plant: ReminderPlant & { readonly remindersEnabled: boolean }
  type: CareReminderType
  scheduledDate: Date
}

type ScheduleContext =
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | CanopyRepository

const scheduleForRecipient = (
  recipientId: string,
  params: ScheduleCareReminderParams
) =>
  Effect.gen(function* () {
    const settings = yield* getUserNotificationSettings(recipientId)
    if (!settings.careReminders || isOnVacation(settings, nowAsDate())) {
      return
    }

    const scheduledAt = yield* calculateScheduledAt(
      params.scheduledDate,
      settings.timezone,
      settings.preferredTime
    )
    const finalScheduledAt = settings.doNotDisturb
      ? yield* adjustForDoNotDisturb(
          scheduledAt,
          settings.timezone,
          settings.doNotDisturbStart,
          settings.doNotDisturbEnd
        )
      : scheduledAt

    yield* scheduleDeferredCareNotification({
      type: params.type,
      scheduledAt: finalScheduledAt,
      userId: recipientId,
      plantId: params.plant.id,
    })
  })

export const scheduleCareReminder = (
  params: ScheduleCareReminderParams
): Effect.Effect<void, SqlError, ScheduleContext> =>
  Effect.gen(function* () {
    if (!params.plant.remindersEnabled) {
      return
    }
    const recipients = yield* reminderRecipients(params.plant)
    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.deletePendingByPlantAndType(
      params.plant.id,
      params.type
    )
    yield* Effect.forEach(
      recipients,
      (recipientId) => scheduleForRecipient(recipientId, params),
      { discard: true }
    )
  })

export const scheduleCareReminders = (
  reminders: readonly ScheduleCareReminderParams[]
): Effect.Effect<void, SqlError, ScheduleContext> =>
  Effect.forEach(reminders, (reminder) => scheduleCareReminder(reminder), {
    concurrency: 'unbounded',
  })
