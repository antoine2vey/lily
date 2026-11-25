import { Array, DateTime, Option, pipe, Record } from 'effect'

import { TIME_ZONE_ALIASES } from '../../notification/time-zones.generated'
import type { ServerZoneName, ZoneName } from './zone-name'

/** Zero-pad a 1-2 digit number to a 2-char string (e.g. 6 -> "06"). */
const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

const MS_PER_HOUR = 3_600_000

const aliasesOf: ReadonlyMap<string, ReadonlyArray<string>> = Array.reduce(
  Record.toEntries(TIME_ZONE_ALIASES),
  new Map<string, ReadonlyArray<string>>(),
  (byZone, [alias, zone]) =>
    byZone.set(zone, [...(byZone.get(zone) ?? []), alias])
)

// POSIX signs: Etc/GMT-5 is UTC+5.
const etcOffset = (zone: string): Option.Option<DateTime.TimeZone> =>
  pipe(
    Option.fromNullishOr(/^Etc\/GMT(?:([+-])(\d{1,2}))?$/.exec(zone)),
    Option.map(([, sign, hours]) =>
      DateTime.zoneMakeOffset(
        (sign === '+' ? -1 : 1) * Number(hours ?? 0) * MS_PER_HOUR
      )
    )
  )

/**
 * The zone every helper below hands to Effect.
 *
 * `DateTime.makeZoned` parses a string `timeZone` itself and reads any name
 * that starts with GMT as an offset, so a bare `'GMT'` throws there. Passing
 * the resolved zone skips that parser. `'UTC'` maps to a fixed offset because
 * Hermes on Android lacks the Intl options a named zone needs.
 *
 * Intl on a phone may know a zone only by an older name: Hermes on iOS accepts
 * only `NSTimeZone.knownTimeZoneNames`, which lists `Asia/Calcutta` and no
 * `Asia/Kolkata` or `Etc/GMT±N`, and stale Android tzdata lacks `Europe/Kyiv`.
 * So a zone Intl rejects resolves through each alias that names it, then an
 * `Etc/GMT±N` zone through its fixed offset. None when all of them fail, which
 * a zone newer than the phone's tzdata does.
 */
export const zoneOnThisRuntime = (
  zone: ServerZoneName
): Option.Option<DateTime.TimeZone> =>
  zone === 'UTC'
    ? Option.some(DateTime.zoneMakeOffset(0))
    : pipe(
        DateTime.zoneMakeNamed(zone),
        Option.orElse(() =>
          Array.findFirst(aliasesOf.get(zone) ?? [], DateTime.zoneMakeNamed)
        ),
        Option.orElse(() => etcOffset(zone))
      )

/** `zoneOnThisRuntime`, throwing when Intl knows the zone by no name. */
export const zoneFromName = (zone: ZoneName): DateTime.TimeZone =>
  pipe(
    zoneOnThisRuntime(zone),
    Option.getOrElse(() => DateTime.zoneMakeNamedUnsafe(zone))
  )

/** `dateTime` in `zone`. */
export const withTimeZone = (
  dateTime: DateTime.DateTime,
  zone: ZoneName
): DateTime.Zoned => DateTime.setZone(dateTime, zoneFromName(zone))

/**
 * Local midnight of the day `dateTime` falls on in `zone`, shifted by
 * `daysLater` calendar days. When a clock change skips midnight, this is the
 * first instant of that day.
 */
const localMidnight = (
  dateTime: DateTime.DateTime,
  zone: ZoneName,
  daysLater: number
): DateTime.Zoned => {
  const parts = DateTime.toParts(withTimeZone(dateTime, zone))
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
    { timeZone: zoneFromName(zone), adjustForTimeZone: true }
  )
}

/**
 * Get start of day (00:00:00.000) for a DateTime.
 *
 * @param dateTime - DateTime to get start of day for
 * @param zone - Zone whose day it is
 * @returns DateTime at 00:00:00.000 of the same day
 */
export const startOfDay = (
  dateTime: DateTime.DateTime,
  zone: ZoneName
): DateTime.DateTime => localMidnight(dateTime, zone, 0)

/**
 * Get start of week (Monday 00:00:00.000) for a DateTime.
 *
 * @param dateTime - DateTime to get start of week for
 * @param zone - Zone whose week it is
 * @returns DateTime at Monday 00:00:00.000 of the same week
 */
export const startOfWeek = (
  dateTime: DateTime.DateTime,
  zone: ZoneName
): DateTime.DateTime => {
  const weekDay = DateTime.toParts(withTimeZone(dateTime, zone)).weekDay
  return localMidnight(dateTime, zone, -((weekDay + 6) % 7))
}

const dayKeyOfParts = (parts: {
  readonly year: number
  readonly month: number
  readonly day: number
}): string => `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`

/**
 * Get the calendar-day key (YYYY-MM-DD) for a DateTime in a specific timezone.
 *
 * This is the authoritative "which local day does this instant fall on" used to
 * synchronize the API's care-task buckets with the client calendar. Building the
 * key from zoned parts (not `toDateUtc`) means it never drifts across the UTC
 * boundary the way `toLocaleDateString` without a timeZone would.
 *
 * @param dateTime - DateTime to key
 * @param zone - Zone whose day it is
 * @returns Date key in YYYY-MM-DD form, in the given zone
 */
export const localDayKey = (
  dateTime: DateTime.DateTime,
  zone: ZoneName
): string => dayKeyOfParts(DateTime.toParts(withTimeZone(dateTime, zone)))

/** The UTC calendar day (YYYY-MM-DD) of `dateTime`. */
export const utcDayKey = (dateTime: DateTime.DateTime): string =>
  dayKeyOfParts(DateTime.toPartsUtc(dateTime))

/**
 * The instant of local midnight that starts the calendar day `dayKey`
 * (YYYY-MM-DD) in `zone`, shifted by `daysLater` calendar days. Inverse of
 * `localDayKey`: `localDayKey(startOfLocalDay(k, zone), zone) === k`.
 *
 * DST-safe: the day is shifted as calendar parts, not as 24h of elapsed time,
 * so a 23h or 25h day still lands on the next local midnight.
 *
 * @param dayKey - Date key in YYYY-MM-DD form
 * @param zone - Zone whose day it is
 * @param daysLater - Calendar days to add to `dayKey` (default 0)
 * @returns None when `dayKey` is not a real calendar date
 */
export const startOfLocalDay = (
  dayKey: string,
  zone: ZoneName,
  daysLater = 0
): Option.Option<DateTime.Zoned> =>
  pipe(
    DateTime.make(`${dayKey}T00:00:00.000Z`),
    Option.filter((utc) => utcDayKey(utc) === dayKey),
    Option.flatMap((utc) => {
      const parts = DateTime.toPartsUtc(utc)
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
        { timeZone: zoneFromName(zone), adjustForTimeZone: true }
      )
    })
  )

/**
 * Get start of today as Date in a specific timezone.
 *
 * @param zone - Zone whose day it is
 * @returns Start of today (00:00:00.000) in `zone`
 */
export const startOfTodayAsDate = (zone: ZoneName): Date =>
  DateTime.toDateUtc(localMidnight(DateTime.nowUnsafe(), zone, 0))

/**
 * Get start of tomorrow as Date in a specific timezone. Tomorrow is the next
 * calendar day, which starts 23 or 25 hours after today when the clocks change.
 *
 * @param zone - Zone whose day it is
 * @returns Start of tomorrow (00:00:00.000) in `zone`
 */
export const startOfTomorrowAsDate = (zone: ZoneName): Date =>
  DateTime.toDateUtc(localMidnight(DateTime.nowUnsafe(), zone, 1))
