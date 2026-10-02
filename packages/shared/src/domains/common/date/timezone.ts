import { DateTime, Option, pipe } from 'effect'

/** Zero-pad a 1-2 digit number to a 2-char string (e.g. 6 -> "06"). */
const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

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
          : DateTime.zoneMakeNamedUnsafe(timezone)
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
  return DateTime.makeZonedUnsafe(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
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
  return DateTime.makeZonedUnsafe(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
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

  return DateTime.makeZonedUnsafe(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day + daysUntilSunday,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    },
    { timeZone: timezone, adjustForTimeZone: true }
  )
}

/**
 * Get the calendar-day key (YYYY-MM-DD) for a DateTime in a specific timezone.
 *
 * This is the authoritative "which local day does this instant fall on" used to
 * synchronize the API's care-task buckets with the client calendar. Building the
 * key from zoned parts (not `toDateUtc`) means it never drifts across the UTC
 * boundary the way `toLocaleDateString` without a timeZone would.
 *
 * @param dateTime - DateTime to key
 * @param timezone - IANA timezone string (e.g. 'Europe/Paris')
 * @returns Date key in YYYY-MM-DD form, in the given timezone
 */
export const localDayKey = (
  dateTime: DateTime.DateTime,
  timezone: string
): string => {
  const parts = DateTime.toParts(withTimeZone(dateTime, timezone))
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

/**
 * The instant of local midnight that starts the calendar day `dayKey`
 * (YYYY-MM-DD) in `timezone`, shifted by `daysLater` calendar days. Inverse of
 * `localDayKey`: `localDayKey(startOfLocalDay(k, tz), tz) === k`.
 *
 * DST-safe: the day is shifted as calendar parts, not as 24h of elapsed time,
 * so a 23h or 25h day still lands on the next local midnight.
 *
 * @param dayKey - Date key in YYYY-MM-DD form
 * @param timezone - IANA timezone string
 * @param daysLater - Calendar days to add to `dayKey` (default 0)
 * @returns None when `dayKey` is not a real calendar date or `timezone` is unknown
 */
export const startOfLocalDay = (
  dayKey: string,
  timezone: string,
  daysLater = 0
): Option.Option<DateTime.Zoned> =>
  pipe(
    DateTime.make(`${dayKey}T00:00:00.000Z`),
    Option.filter((utc) => localDayKey(utc, 'UTC') === dayKey),
    Option.flatMap((utc) => {
      const parts = DateTime.toParts(utc)
      return DateTime.makeZoned(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day + daysLater,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0,
        },
        { timeZone: timezone, adjustForTimeZone: true }
      )
    })
  )

/**
 * Get start of today as Date in a specific timezone.
 *
 * @param timezone - IANA timezone string
 * @returns Start of today (00:00:00.000) in the specified timezone
 */
export const startOfTodayAsDate = (timezone = 'UTC'): Date => {
  const current = withTimeZone(DateTime.nowUnsafe(), timezone)
  const parts = DateTime.toParts(current)
  return DateTime.toDateUtc(
    DateTime.makeZonedUnsafe(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
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
    DateTime.add(DateTime.nowUnsafe(), { days: 1 }),
    timezone
  )
  const parts = DateTime.toParts(tomorrow)
  return DateTime.toDateUtc(
    DateTime.makeZonedUnsafe(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      },
      { timeZone: timezone, adjustForTimeZone: true }
    )
  )
}
