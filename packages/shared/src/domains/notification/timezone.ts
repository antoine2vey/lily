import {
  Array,
  DateTime,
  Effect,
  String as EffectString,
  identity,
  Option,
  pipe,
  Record,
  Schema,
  SchemaTransformation,
} from 'effect'

import { CANONICAL_TIME_ZONES, TIME_ZONE_ALIASES } from './time-zones.generated'

// HH:mm time format validation pattern
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

// Tagged error for invalid timezone
export class InvalidTimezoneError extends Schema.TaggedError<
  InvalidTimezoneError,
  { readonly brand: unique symbol }
>()('InvalidTimezoneError', { timezone: Schema.String }) {}

// Tagged error for invalid time format
export class InvalidTimeFormatError extends Schema.TaggedError<
  InvalidTimeFormatError,
  { readonly brand: unique symbol }
>()('InvalidTimeFormatError', { time: Schema.String }) {}

// Schema for validating HH:mm time format
export const TimeString = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(TIME_PATTERN, {
      message: 'Time must be in HH:mm format (00:00-23:59)',
    })
  )
)

export type TimeString = typeof TimeString.Type

const canonicalZones: ReadonlySet<string> = new Set(CANONICAL_TIME_ZONES)

/**
 * A canonical IANA zone name, the form stored in `users.timezone` and
 * `canopies.timezone`: a tzdata `Zone` line or a zone `zone.tab` lists.
 * Decoding maps a renamed or legacy name such as `Eire` to its zone
 * (`Europe/Dublin`). A stored zone stays canonical so day math does not depend
 * on whichever tzdata build a runtime ships.
 */
export const TimeZone = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String.check(
      Schema.makeFilter(
        (zone) => canonicalZones.has(zone) || 'a canonical IANA time zone',
        { identifier: 'TimeZone' }
      )
    ).pipe(Schema.brand('TimeZone')),
    SchemaTransformation.transform({
      decode: (zone: string) =>
        Option.getOrElse(Record.get(TIME_ZONE_ALIASES, zone), () => zone),
      encode: identity,
    })
  )
)

export type TimeZone = typeof TimeZone.Type

// Validate an IANA timezone string using Effect's DateTime module
export const validateTimezone = (
  timezone: string
): Effect.Effect<string, InvalidTimezoneError> =>
  Effect.gen(function* () {
    const result = DateTime.zoneMakeNamed(timezone)
    if (Option.isNone(result)) {
      return yield* new InvalidTimezoneError({ timezone })
    }
    return timezone
  })

// Validate time format (HH:mm)
export const validateTimeFormat = (
  time: string
): Effect.Effect<string, InvalidTimeFormatError> =>
  TIME_PATTERN.test(time)
    ? Effect.succeed(time)
    : Effect.fail(new InvalidTimeFormatError({ time }))

// Parse time string to hours and minutes
export const parseTime = (
  time: string
): Effect.Effect<{ hours: number; minutes: number }, InvalidTimeFormatError> =>
  Effect.gen(function* () {
    yield* validateTimeFormat(time)
    const parts = EffectString.split(time, ':')
    const hoursStr = pipe(
      Array.head(parts),
      Option.getOrElse(() => '0')
    )
    const minutesStr = pipe(
      Array.get(parts, 1),
      Option.getOrElse(() => '0')
    )
    return {
      hours: parseInt(hoursStr, 10),
      minutes: parseInt(minutesStr, 10),
    }
  })

// Default values for timezone settings
export const DEFAULT_TIMEZONE: TimeZone = TimeZone.make('UTC')
export const DEFAULT_NOTIFICATION_TIME = '09:00'

/**
 * Parse a HH:mm time string into total minutes since midnight.
 */
export const timeToMinutes = (time: string): number => {
  const parts = EffectString.split(time, ':')
  const h = parseInt(
    pipe(
      Array.head(parts),
      Option.getOrElse(() => '0')
    ),
    10
  )
  const m = parseInt(
    pipe(
      Array.get(parts, 1),
      Option.getOrElse(() => '0')
    ),
    10
  )
  return h * 60 + m
}

/**
 * Check if a time (in minutes since midnight) falls within a DND window.
 * Handles midnight wraparound (e.g. 22:00 → 07:00).
 */
export const isInDndWindow = (
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
