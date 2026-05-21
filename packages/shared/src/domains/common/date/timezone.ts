import { DateTime } from 'effect'

/**
 * Apply a named timezone to a DateTime, returning a Zoned DateTime.
 * If no timezone is provided, returns the original DateTime unchanged.
 *
 * @param dateTime - DateTime to apply timezone to
 * @param timezone - IANA timezone string (e.g., 'Europe/Paris')
 * @returns Zoned DateTime if timezone provided, otherwise original DateTime
 */
export const withTimeZone = (
  dateTime: DateTime.DateTime,
  timezone?: string
): DateTime.DateTime =>
  timezone
    ? DateTime.setZone(
        dateTime,
        timezone === 'UTC'
          ? DateTime.zoneMakeOffset(0)
          : DateTime.zoneUnsafeMakeNamed(timezone)
      )
    : dateTime

/**
 * Get start of day (00:00:00.000) for a DateTime.
 *
 * @param dateTime - DateTime to get start of day for
 * @param timezone - IANA timezone string
 * @returns DateTime at 00:00:00.000 of the same day
 */
export const startOfDay = (
  dateTime: DateTime.DateTime,
  timezone: string
): DateTime.DateTime => {
  const zoned = withTimeZone(dateTime, timezone)
  const parts = DateTime.toParts(zoned)
  return DateTime.unsafeMakeZoned(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hours: 0,
      minutes: 0,
      seconds: 0,
      millis: 0,
    },
    { timeZone: timezone, adjustForTimeZone: true }
  )
}

/**
 * Get end of day (23:59:59.999) for a DateTime.
 *
 * @param dateTime - DateTime to get end of day for
 * @param timezone - IANA timezone string
 * @returns DateTime at 23:59:59.999 of the same day
 */
export const endOfDay = (
  dateTime: DateTime.DateTime,
  timezone: string
): DateTime.DateTime => {
  const zoned = withTimeZone(dateTime, timezone)
  const parts = DateTime.toParts(zoned)
  return DateTime.unsafeMakeZoned(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hours: 23,
      minutes: 59,
      seconds: 59,
      millis: 999,
    },
    { timeZone: timezone, adjustForTimeZone: true }
  )
}

/**
 * Get end of week (Sunday 23:59:59.999) for a DateTime.
 * Week ends on Sunday.
 *
 * @param dateTime - DateTime to get end of week for
 * @param timezone - IANA timezone string
 * @returns DateTime at Sunday 23:59:59.999 of the same week
 */
export const endOfWeek = (
  dateTime: DateTime.DateTime,
  timezone: string
): DateTime.DateTime => {
  const zoned = withTimeZone(dateTime, timezone)
  const parts = DateTime.toParts(zoned)
  const dayOfWeek = parts.weekDay
  const daysUntilSunday = 7 - dayOfWeek

  return DateTime.unsafeMakeZoned(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day + daysUntilSunday,
      hours: 23,
      minutes: 59,
      seconds: 59,
      millis: 999,
    },
    { timeZone: timezone, adjustForTimeZone: true }
  )
}

/**
 * Get start of today as Date in a specific timezone.
 *
 * @param timezone - IANA timezone string
 * @returns Start of today (00:00:00.000) in the specified timezone
 */
export const startOfTodayAsDate = (timezone = 'UTC'): Date => {
  const current = withTimeZone(DateTime.unsafeNow(), timezone)
  const parts = DateTime.toParts(current)
  return DateTime.toDateUtc(
    DateTime.unsafeMakeZoned(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hours: 0,
        minutes: 0,
        seconds: 0,
        millis: 0,
      },
      { timeZone: timezone, adjustForTimeZone: true }
    )
  )
}

/**
 * Get start of tomorrow as Date in a specific timezone.
 *
 * @param timezone - IANA timezone string
 * @returns Start of tomorrow (00:00:00.000) in the specified timezone
 */
export const startOfTomorrowAsDate = (timezone = 'UTC'): Date => {
  // Add before applying the timezone — `DateTime.add` on a Zoned
  // DateTime can throw `RangeError: Invalid time value` under Hermes
  // for some timezones. Safe pattern: arithmetic on UTC, then zone.
  const tomorrow = withTimeZone(
    DateTime.add(DateTime.unsafeNow(), { days: 1 }),
    timezone
  )
  const parts = DateTime.toParts(tomorrow)
  return DateTime.toDateUtc(
    DateTime.unsafeMakeZoned(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hours: 0,
        minutes: 0,
        seconds: 0,
        millis: 0,
      },
      { timeZone: timezone, adjustForTimeZone: true }
    )
  )
}
