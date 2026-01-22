import {
  DEFAULT_NOTIFICATION_TIME,
  DEFAULT_TIMEZONE,
  InvalidTimezoneError,
  parseTime,
  validateTimezone,
} from '@lily/shared'
import { DateTime, Effect, Option, pipe } from 'effect'

/**
 * Calculates the scheduled notification time in the user's preferred timezone
 * at their preferred time of day.
 *
 * @param baseDate - The date when the care task is due (e.g., next watering date)
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @param preferredTime - Time in HH:mm format (e.g., "09:00")
 * @returns Date object representing when the notification should be sent (in UTC)
 */
export const calculateScheduledAt = (
  baseDate: Date,
  timezone: string | null,
  preferredTime: string | null
): Effect.Effect<Date, never> =>
  Effect.gen(function* () {
    const tz = pipe(
      Option.fromNullable(timezone),
      Option.getOrElse(() => DEFAULT_TIMEZONE)
    )
    const time = pipe(
      Option.fromNullable(preferredTime),
      Option.getOrElse(() => DEFAULT_NOTIFICATION_TIME)
    )

    // Try to validate timezone, fall back to UTC if invalid
    const validTimezone = yield* pipe(
      validateTimezone(tz),
      Effect.catchTag('InvalidTimezoneError', () => {
        Effect.logWarning(
          `Invalid timezone "${tz}", falling back to ${DEFAULT_TIMEZONE}`
        )
        return Effect.succeed(DEFAULT_TIMEZONE)
      })
    )

    // Parse the preferred time
    const { hours, minutes } = yield* pipe(
      parseTime(time),
      Effect.catchTag('InvalidTimeFormatError', () => {
        Effect.logWarning(
          `Invalid time format "${time}", falling back to ${DEFAULT_NOTIFICATION_TIME}`
        )
        const parts = DEFAULT_NOTIFICATION_TIME.split(':')
        const h = parts[0] ?? '9'
        const m = parts[1] ?? '0'
        return Effect.succeed({ hours: parseInt(h, 10), minutes: parseInt(m, 10) })
      })
    )

    // Create a zoned DateTime for the base date
    const zone = pipe(
      DateTime.zoneMakeNamed(validTimezone),
      Option.getOrElse(() => DateTime.zoneUnsafeMakeNamed(DEFAULT_TIMEZONE))
    )

    // Create DateTime from the base date
    const baseDateTime = DateTime.unsafeMake(baseDate)

    // Adjust to the user's timezone
    const zonedDateTime = DateTime.setZone(baseDateTime, zone)

    // Set the time to the user's preferred notification time
    const adjustedDateTime = pipe(
      zonedDateTime,
      DateTime.setParts({ hours, minutes, seconds: 0, millis: 0 })
    )

    // Convert back to UTC for storage
    const utcDateTime = DateTime.toDate(adjustedDateTime)

    // If the calculated time is in the past, add 1 day
    const now = new Date()
    if (utcDateTime < now) {
      const nextDayDateTime = pipe(
        adjustedDateTime,
        DateTime.addDuration('1 day')
      )
      return DateTime.toDate(nextDayDateTime)
    }

    return utcDateTime
  })

/**
 * Recalculates all pending notifications for a user when their timezone
 * or preferred notification time changes.
 *
 * @param pendingNotifications - Array of pending notifications with their base dates
 * @param newTimezone - New IANA timezone string
 * @param newPreferredTime - New preferred notification time in HH:mm format
 * @returns Array of notification updates with new scheduledAt times
 */
export interface NotificationWithBaseDate {
  notificationId: string
  baseDate: Date
}

export interface NotificationScheduleUpdate {
  notificationId: string
  scheduledAt: Date
}

export const recalculateNotificationSchedules = (
  notifications: NotificationWithBaseDate[],
  newTimezone: string | null,
  newPreferredTime: string | null
): Effect.Effect<NotificationScheduleUpdate[], never> =>
  Effect.forEach(
    notifications,
    (notification) =>
      Effect.gen(function* () {
        const scheduledAt = yield* calculateScheduledAt(
          notification.baseDate,
          newTimezone,
          newPreferredTime
        )
        return {
          notificationId: notification.notificationId,
          scheduledAt,
        }
      }),
    { concurrency: 10 }
  )
