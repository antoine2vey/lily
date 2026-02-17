import { DateTime, Duration, Option, pipe } from 'effect'

import { type DateInput, formatApiDateWith, now, parseApiDate } from './parse'
import { endOfDay, endOfWeek, startOfDay, withTimeZone } from './timezone'

/**
 * Calculate days until a future date (positive) or days overdue (negative).
 *
 * @param target - Target DateTime to compare against current time
 * @returns Number of days (positive if future, negative if past)
 */
export const daysUntil = (target: DateTime.DateTime): number => {
  const currentDay = DateTime.startOf(DateTime.unsafeNow(), 'day')
  const targetDay = DateTime.startOf(target, 'day')
  const distanceMs = DateTime.distance(currentDay, targetDay)
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
  const distanceMs = DateTime.distance(from, to)
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
  const current = DateTime.unsafeNow()
  return DateTime.lessThan(dateTime, current)
}

/**
 * Check if DateTime is in the future.
 *
 * @param dateTime - DateTime to check
 * @returns true if the DateTime is in the future
 */
export const isFuture = (dateTime: DateTime.DateTime): boolean => {
  const current = DateTime.unsafeNow()
  return DateTime.greaterThan(dateTime, current)
}

/**
 * Check if a date is before the start of today (overdue by day).
 * Unlike isOverdue which checks against current time, this checks against start of today.
 *
 * @param dateTime - DateTime to check
 * @param referenceDate - Reference DateTime (defaults to now)
 * @param timezone - IANA timezone string
 * @returns true if the DateTime is before the start of today
 */
export const isOverdueByDay = (
  dateTime: DateTime.DateTime,
  referenceDate: DateTime.DateTime,
  timezone: string
): boolean => {
  return DateTime.lessThan(dateTime, startOfDay(referenceDate, timezone))
}

/**
 * Check if a DateTime is this week (after today, before end of week).
 *
 * @param dateTime - DateTime to check
 * @param referenceDate - Reference DateTime (defaults to now)
 * @param timezone - IANA timezone string
 * @returns true if the DateTime is this week but after today
 */
export const isThisWeek = (
  dateTime: DateTime.DateTime,
  referenceDate: DateTime.DateTime,
  timezone: string
): boolean => {
  const weekEnd = endOfWeek(referenceDate, timezone)
  const afterToday = DateTime.greaterThan(
    dateTime,
    endOfDay(referenceDate, timezone)
  )
  const beforeEndOfWeek = DateTime.lessThanOrEqualTo(dateTime, weekEnd)
  return afterToday && beforeEndOfWeek
}

/**
 * Check if a DateTime is yesterday.
 *
 * @param dateTime - DateTime to check
 * @param timezone - IANA timezone string
 * @returns true if the DateTime is yesterday
 */
export const isYesterday = (
  dateTime: DateTime.DateTime,
  timezone: string
): boolean => {
  const current = withTimeZone(DateTime.unsafeNow(), timezone)
  const yesterday = DateTime.subtract(current, { days: 1 })
  const target = withTimeZone(dateTime, timezone)
  const targetParts = DateTime.toParts(target)
  const yesterdayParts = DateTime.toParts(yesterday)
  return (
    targetParts.year === yesterdayParts.year &&
    targetParts.month === yesterdayParts.month &&
    targetParts.day === yesterdayParts.day
  )
}

/**
 * Parse an API date and calculate days until that date.
 * Convenience function combining parseApiDate and daysUntil.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param defaultValue - Value to return if date is invalid (default: 0)
 * @returns Number of days until the date, or defaultValue if invalid
 */
export const daysUntilApiDate = (
  dateInput: DateInput,
  defaultValue = 0
): number => formatApiDateWith(daysUntil, defaultValue)(dateInput)

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
      const distanceMs = DateTime.distance(pastDate, now())
      return Math.floor(Duration.toDays(Duration.millis(Math.abs(distanceMs))))
    }),
    Option.getOrElse(() => defaultValue)
  )
