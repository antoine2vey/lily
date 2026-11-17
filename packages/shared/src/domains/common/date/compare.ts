import { DateTime, Duration, Option, pipe } from 'effect'

import { CareDays } from '../../care/care-day'
import { type DateInput, now, parseApiDate } from './parse'
import { startOfDay, withTimeZone } from './timezone'

/**
 * Calculate the whole-day offset of a DateTime from a reference, in a timezone.
 *
 * Returns 0 if `dateTime` is the same calendar day as `referenceDate` in the
 * given timezone, a negative number if it is an earlier day (overdue), and a
 * positive number for future days. The difference is measured between local
 * day-starts and rounded, so it stays correct across DST transitions (where a
 * local day spans 23 or 25 hours).
 *
 * This is the client calendar's authoritative column index: a task with
 * `localDayOffset === i` belongs in the i-th day column.
 *
 * @param dateTime - DateTime to measure
 * @param referenceDate - Reference "today" DateTime
 * @param timezone - IANA timezone string
 * @returns Signed whole-day offset (0 = same local day as reference)
 */
export const localDayOffset = (
  dateTime: DateTime.DateTime,
  referenceDate: DateTime.DateTime,
  timezone: string
): number => {
  const targetStart = startOfDay(dateTime, timezone)
  const currentStart = startOfDay(referenceDate, timezone)
  const distanceMs = Duration.toMillis(
    DateTime.distance(currentStart, targetStart)
  )
  const sign = distanceMs >= 0 ? 1 : -1
  const days = Duration.toDays(Duration.millis(Math.abs(distanceMs)))
  return sign * Math.round(days)
}

/**
 * Calculate days between two dates.
 *
 * @param from - Start DateTime
 * @param to - End DateTime
 * @returns Number of days between the two dates (always positive)
 */
export const daysBetween = (
  from: DateTime.DateTime,
  to: DateTime.DateTime
): number => {
  const distanceMs = Duration.toMillis(DateTime.distance(from, to))
  return Math.ceil(Duration.toDays(Duration.millis(Math.abs(distanceMs))))
}

/**
 * Check if DateTime is today.
 *
 * @param dateTime - DateTime to check
 * @param referenceDate - Reference DateTime (defaults to now)
 * @param timezone - IANA timezone string
 * @returns true if the DateTime is today
 */
export const isToday = (
  dateTime: DateTime.DateTime,
  referenceDate: DateTime.DateTime,
  timezone: string
): boolean => {
  const current = withTimeZone(referenceDate, timezone)
  const target = withTimeZone(dateTime, timezone)
  const targetParts = DateTime.toParts(target)
  const currentParts = DateTime.toParts(current)
  return (
    targetParts.year === currentParts.year &&
    targetParts.month === currentParts.month &&
    targetParts.day === currentParts.day
  )
}

/**
 * Check if DateTime is overdue (in the past).
 *
 * @param dateTime - DateTime to check
 * @returns true if the DateTime is in the past
 */
export const isOverdue = (dateTime: DateTime.DateTime): boolean => {
  const current = DateTime.nowUnsafe()
  return DateTime.isLessThan(dateTime, current)
}

/**
 * Check if DateTime is in the future.
 *
 * @param dateTime - DateTime to check
 * @returns true if the DateTime is in the future
 */
export const isFuture = (dateTime: DateTime.DateTime): boolean => {
  const current = DateTime.nowUnsafe()
  return DateTime.isGreaterThan(dateTime, current)
}

/**
 * Check if a DateTime is yesterday, the calendar day before today.
 *
 * @param dateTime - DateTime to check
 * @param timezone - IANA timezone string
 * @returns true if the DateTime is yesterday
 */
export const isYesterday = (
  dateTime: DateTime.DateTime,
  timezone: string
): boolean =>
  CareDays.of(dateTime, timezone) ===
  CareDays.addDays(CareDays.today(timezone, DateTime.nowUnsafe()), -1)

/**
 * Calculate days since a date (days between a past date and now).
 * Uses floor rounding so same-day returns 0, yesterday returns 1, etc.
 * Always returns a non-negative number.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param defaultValue - Value to return if date is invalid (default: 0)
 * @returns Number of complete days since the date
 */
export const daysSince = (dateInput: DateInput, defaultValue = 0): number =>
  pipe(
    parseApiDate(dateInput),
    Option.map((pastDate) => {
      const distanceMs = Duration.toMillis(DateTime.distance(pastDate, now()))
      return Math.floor(Duration.toDays(Duration.millis(Math.abs(distanceMs))))
    }),
    Option.getOrElse(() => defaultValue)
  )
