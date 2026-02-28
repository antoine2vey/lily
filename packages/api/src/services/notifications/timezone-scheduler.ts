import {
  DEFAULT_NOTIFICATION_TIME,
  DEFAULT_TIMEZONE,
  parseTime,
  validateTimezone,
} from '@lily/shared'
import {
  Array,
  DateTime,
  Effect,
  String as EffectString,
  Option,
  pipe,
} from 'effect'

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
      Effect.catchTag('InvalidTimezoneError', () =>
        Effect.gen(function* () {
          yield* Effect.logWarning(
            `Invalid timezone "${tz}", falling back to ${DEFAULT_TIMEZONE}`
          )
          return DEFAULT_TIMEZONE
        })
      )
    )

    // Parse the preferred time
    const { hours, minutes } = yield* pipe(
      parseTime(time),
      Effect.catchTag('InvalidTimeFormatError', () =>
        Effect.gen(function* () {
          yield* Effect.logWarning(
            `Invalid time format "${time}", falling back to ${DEFAULT_NOTIFICATION_TIME}`
          )
          const parts = EffectString.split(DEFAULT_NOTIFICATION_TIME, ':')
          const h = pipe(
            Array.head(parts),
            Option.getOrElse(() => '9')
          )
          const m = pipe(
            Array.get(parts, 1),
            Option.getOrElse(() => '0')
          )
          return {
            hours: parseInt(h, 10),
            minutes: parseInt(m, 10),
          }
        })
      )
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
    const utcDateTime = DateTime.toDateUtc(adjustedDateTime)

    // If the calculated time is in the past, add 1 day
    const now = DateTime.toDateUtc(DateTime.unsafeNow())
    if (utcDateTime < now) {
      const nextDayDateTime = pipe(
        adjustedDateTime,
        DateTime.addDuration('1 day')
      )
      return DateTime.toDateUtc(nextDayDateTime)
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

const DEFAULT_DND_START = '22:00'
const DEFAULT_DND_END = '07:00'

/**
 * Parse a HH:mm time string into total minutes since midnight.
 */
const timeToMinutes = (time: string): number => {
  const parts = EffectString.split(time, ':')
  const h = parseInt(parts[0] ?? '0', 10)
  const m = parseInt(parts[1] ?? '0', 10)
  return h * 60 + m
}

/**
 * Check if a time (in minutes since midnight) falls within a DND window.
 * Handles midnight wraparound (e.g. 22:00 → 07:00).
 */
const isInDndWindow = (
  timeMinutes: number,
  startMinutes: number,
  endMinutes: number
): boolean => {
  // If start equals end, no DND window
  if (startMinutes === endMinutes) return false

  // Wrapping window (e.g., 22:00 → 07:00)
  if (startMinutes > endMinutes) {
    return timeMinutes >= startMinutes || timeMinutes < endMinutes
  }

  // Non-wrapping window (e.g., 01:00 → 06:00)
  return timeMinutes >= startMinutes && timeMinutes < endMinutes
}

/**
 * Adjusts a scheduled notification time if it falls within the user's
 * Do Not Disturb window. Delays the notification to the DND end time.
 *
 * @param scheduledAt - The originally calculated UTC Date
 * @param timezone - User's IANA timezone string
 * @param dndStart - DND start time in HH:mm format (e.g., "22:00")
 * @param dndEnd - DND end time in HH:mm format (e.g., "07:00")
 * @returns Adjusted UTC Date (unchanged if outside DND window)
 */
export const adjustForDoNotDisturb = (
  scheduledAt: Date,
  timezone: string | null,
  dndStart: string | null,
  dndEnd: string | null
): Effect.Effect<Date, never> =>
  Effect.gen(function* () {
    const tz = pipe(
      Option.fromNullable(timezone),
      Option.getOrElse(() => DEFAULT_TIMEZONE)
    )
    const start = pipe(
      Option.fromNullable(dndStart),
      Option.getOrElse(() => DEFAULT_DND_START)
    )
    const end = pipe(
      Option.fromNullable(dndEnd),
      Option.getOrElse(() => DEFAULT_DND_END)
    )

    // Validate timezone, fallback to UTC
    const validTimezone = yield* pipe(
      validateTimezone(tz),
      Effect.catchTag('InvalidTimezoneError', () =>
        Effect.succeed(DEFAULT_TIMEZONE)
      )
    )

    const zone = pipe(
      DateTime.zoneMakeNamed(validTimezone),
      Option.getOrElse(() => DateTime.zoneUnsafeMakeNamed(DEFAULT_TIMEZONE))
    )

    // Convert scheduledAt to user's timezone
    const scheduledDateTime = pipe(
      DateTime.unsafeMake(scheduledAt),
      DateTime.setZone(zone)
    )

    // Get local time parts
    const parts = DateTime.toParts(scheduledDateTime)
    const scheduledMinutes = parts.hours * 60 + parts.minutes

    const startMinutes = timeToMinutes(start)
    const endMinutes = timeToMinutes(end)

    if (!isInDndWindow(scheduledMinutes, startMinutes, endMinutes)) {
      return scheduledAt
    }

    // Adjust to DND end time
    const endHours = Math.floor(endMinutes / 60)
    const endMins = endMinutes % 60

    const adjusted = pipe(
      scheduledDateTime,
      DateTime.setParts({
        hours: endHours,
        minutes: endMins,
        seconds: 0,
        millis: 0,
      })
    )

    // If the DND wraps around midnight and the scheduled time is in the
    // evening portion (>= start), the end time is on the next day
    const needsNextDay =
      startMinutes > endMinutes && scheduledMinutes >= startMinutes

    const finalDateTime = needsNextDay
      ? DateTime.addDuration(adjusted, '1 day')
      : adjusted

    return DateTime.toDateUtc(finalDateTime)
  })

/**
 * Check if a given UTC Date falls within a user's DND window right now.
 * Used by the scheduler safety net to skip notifications during DND.
 */
export const isInDoNotDisturbWindow = (
  currentTime: Date,
  timezone: string | null,
  dndStart: string | null,
  dndEnd: string | null
): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const tz = pipe(
      Option.fromNullable(timezone),
      Option.getOrElse(() => DEFAULT_TIMEZONE)
    )
    const start = pipe(
      Option.fromNullable(dndStart),
      Option.getOrElse(() => DEFAULT_DND_START)
    )
    const end = pipe(
      Option.fromNullable(dndEnd),
      Option.getOrElse(() => DEFAULT_DND_END)
    )

    const validTimezone = yield* pipe(
      validateTimezone(tz),
      Effect.catchTag('InvalidTimezoneError', () =>
        Effect.succeed(DEFAULT_TIMEZONE)
      )
    )

    const zone = pipe(
      DateTime.zoneMakeNamed(validTimezone),
      Option.getOrElse(() => DateTime.zoneUnsafeMakeNamed(DEFAULT_TIMEZONE))
    )

    const zonedTime = pipe(
      DateTime.unsafeMake(currentTime),
      DateTime.setZone(zone)
    )

    const parts = DateTime.toParts(zonedTime)
    const currentMinutes = parts.hours * 60 + parts.minutes

    return isInDndWindow(
      currentMinutes,
      timeToMinutes(start),
      timeToMinutes(end)
    )
  })

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
