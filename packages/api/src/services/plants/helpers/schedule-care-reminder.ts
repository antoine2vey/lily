import type { SqlError } from '@effect/sql/SqlError'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleDeferredCareNotification } from '@lily/api/services/helpers/schedule-notification'
import {
  adjustForDoNotDisturb,
  calculateScheduledAt,
} from '@lily/api/services/notifications/timezone-scheduler'
import { getUserNotificationSettings } from '@lily/api/services/plants/helpers/user-settings'
import { Effect, Option, pipe } from 'effect'

export type CareReminderType =
  | 'watering_reminder'
  | 'fertilization_reminder'
  | 'misting_reminder'
  | 'repotting_reminder'

export interface ScheduleCareReminderParams {
  plantId: string
  userId: string
  type: CareReminderType
  scheduledDate: Date
  remindersEnabled: boolean
}

/**
 * Schedule a care reminder notification for a plant.
 * This handles:
 * - Checking if reminders are enabled
 * - Fetching user's timezone preferences
 * - Calculating timezone-aware scheduled time
 * - Deleting any existing pending reminders of the same type
 * - Creating the new reminder
 *
 * @param params - The reminder scheduling parameters
 * @returns Effect that resolves when reminder is scheduled (or skipped if disabled)
 */
export const scheduleCareReminder = (
  params: ScheduleCareReminderParams
): Effect.Effect<
  void,
  SqlError,
  NotificationRepository | UserRepository | DelegationRepository
> =>
  Effect.gen(function* () {
    const { plantId, userId, type, scheduledDate, remindersEnabled } = params

    // Skip if reminders are disabled
    if (!remindersEnabled) {
      return
    }

    // Resolve the notification recipient: caretaker if delegated, owner otherwise
    const delegationRepo = yield* DelegationRepository
    const caretakerId =
      yield* delegationRepo.findActiveCaretakerForPlant(plantId)
    const recipientId = pipe(
      Option.fromNullable(caretakerId),
      Option.getOrElse(() => userId)
    )

    const notificationRepo = yield* NotificationRepository

    // Get recipient's timezone settings
    const settings = yield* getUserNotificationSettings(recipientId)

    // Skip if user has disabled care reminders globally
    if (!settings.careReminders) {
      return
    }

    // Calculate the scheduled time in user's timezone
    const scheduledAt = yield* calculateScheduledAt(
      scheduledDate,
      settings.timezone,
      settings.preferredTime
    )

    // Adjust for Do Not Disturb window
    const finalScheduledAt = settings.doNotDisturb
      ? yield* adjustForDoNotDisturb(
          scheduledAt,
          settings.timezone,
          settings.doNotDisturbStart,
          settings.doNotDisturbEnd
        )
      : scheduledAt

    // Remove any existing pending reminder for this plant and type
    yield* notificationRepo.deletePendingByPlantAndType(plantId, type)

    // Create new reminder — content is resolved by the notification-scheduler
    // at delivery time, which groups all plants per user into a single push.
    yield* scheduleDeferredCareNotification({
      type,
      scheduledAt: finalScheduledAt,
      userId: recipientId,
      plantId,
    })
  })

/**
 * Schedule multiple care reminders in parallel.
 * Useful for batch operations like watering multiple plants.
 *
 * @param reminders - Array of reminder parameters
 * @returns Effect that resolves when all reminders are scheduled
 */
export const scheduleCareReminders = (
  reminders: readonly ScheduleCareReminderParams[]
): Effect.Effect<
  void,
  SqlError,
  NotificationRepository | UserRepository | DelegationRepository
> =>
  Effect.forEach(reminders, (reminder) => scheduleCareReminder(reminder), {
    concurrency: 'unbounded',
  })
