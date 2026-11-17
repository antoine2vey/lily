/**
 * The zone helpers take a zone name that has already been decoded by the
 * `TimeZone` schema. They compute in UTC, with no error, for a name the schema
 * rejects, such as `GMT+05:00` or an unknown name.
 */
import { DateTime, Option, pipe } from 'effect'

/** Zero-pad a 1-2 digit number to a 2-char string (e.g. 6 -> "06"). */
const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

/**
 * Resolve an IANA zone name, including aliases such as GMT, Eire or
 * US/Pacific, to the zone every helper below hands to Effect.
 *
 * `DateTime.makeZoned` parses a string `timeZone` itself and reads any name
 * that starts with GMT as an offset, so a bare `'GMT'` throws there. Passing
 * the resolved zone skips that parser. `'UTC'` maps to a fixed offset because
 * Hermes on Android lacks the Intl options a named zone needs.
 *
 * @param timezone - IANA timezone string (e.g. 'Europe/Paris')
 * @returns None when Intl does not know `timezone`
 */
export const zoneFromName = (
  timezone: string
): Option.Option<DateTime.TimeZone> =>
  timezone === 'UTC'
    ? Option.some(DateTime.zoneMakeOffset(0))
    : DateTime.zoneMakeNamed(timezone)

/** `zoneFromName`, falling back to UTC when Intl does not know `timezone`. */
export const zoneFromNameOrUtc = (timezone: string): DateTime.TimeZone =>
  Option.getOrElse(zoneFromName(timezone), () => DateTime.zoneMakeOffset(0))

/**
 * Apply a named timezone to a DateTime, returning a Zoned DateTime.
 * If no timezone is provided, returns the original DateTime unchanged.
 *
 * @param dateTime - DateTime to apply timezone to
 * @param timezone - IANA timezone string (e.g., 'Europe/Paris'), UTC when unknown
 * @returns Zoned DateTime if timezone provided, otherwise original DateTime
 */
export const withTimeZone = (
  dateTime: DateTime.DateTime,
  timezone?: string
): DateTime.DateTime =>
  timezone ? DateTime.setZone(dateTime, zoneFromNameOrUtc(timezone)) : dateTime

/**
 * Local midnight of the day `dateTime` falls on in `zone`, shifted by
 * `daysLater` calendar days. When a clock change skips midnight, this is the
 * first instant of that day.
 */
const localMidnight = (
  dateTime: DateTime.DateTime,
  zone: DateTime.TimeZone,
  daysLater: number
): DateTime.Zoned => {
  const parts = DateTime.toParts(DateTime.setZone(dateTime, zone))
  return DateTime.makeZonedUnsafe(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day + daysLater,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    { timeZone: zone, adjustForTimeZone: true }
  )
}

const weekDay = (dateTime: DateTime.DateTime, zone: DateTime.TimeZone) =>
  DateTime.toParts(DateTime.setZone(dateTime, zone)).weekDay

/**
 * Get start of day (00:00:00.000) for a DateTime.
 *
 * @param dateTime - DateTime to get start of day for
 * @param timezone - IANA timezone string, UTC when unknown
 * @returns DateTime at 00:00:00.000 of the same day
 */
export const startOfDay = (
  dateTime: DateTime.DateTime,
  timezone: string
): DateTime.DateTime => localMidnight(dateTime, zoneFromNameOrUtc(timezone), 0)

/**
 * Get start of week (Monday 00:00:00.000) for a DateTime.
 *
 * @param dateTime - DateTime to get start of week for
 * @param timezone - IANA timezone string, UTC when unknown
 * @returns DateTime at Monday 00:00:00.000 of the same week
 */
export const startOfWeek = (
  dateTime: DateTime.DateTime,
  timezone: string
): DateTime.DateTime => {
  const zone = zoneFromNameOrUtc(timezone)
  const daysSinceMonday = (weekDay(dateTime, zone) + 6) % 7
  return localMidnight(dateTime, zone, -daysSinceMonday)
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
 * @param timezone - IANA timezone string (e.g. 'Europe/Paris'), UTC when unknown
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
      return Option.flatMap(zoneFromName(timezone), (zone) =>
        DateTime.makeZoned(
          {
            year: parts.year,
            month: parts.month,
            day: parts.day + daysLater,
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0,
          },
          { timeZone: zone, adjustForTimeZone: true }
        )
      )
    })
  )

/**
 * Get start of today as Date in a specific timezone.
 *
 * @param timezone - IANA timezone string, UTC when unknown
 * @returns Start of today (00:00:00.000) in the specified timezone
 */
export const startOfTodayAsDate = (timezone = 'UTC'): Date =>
  DateTime.toDateUtc(
    localMidnight(DateTime.nowUnsafe(), zoneFromNameOrUtc(timezone), 0)
  )

/**
 * Get start of tomorrow as Date in a specific timezone. Tomorrow is the next
 * calendar day, which starts 23 or 25 hours after today when the clocks change.
 *
 * @param timezone - IANA timezone string, UTC when unknown
 * @returns Start of tomorrow (00:00:00.000) in the specified timezone
 */
export const startOfTomorrowAsDate = (timezone = 'UTC'): Date =>
  DateTime.toDateUtc(
    localMidnight(DateTime.nowUnsafe(), zoneFromNameOrUtc(timezone), 1)
  )
