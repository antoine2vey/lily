import {
  Array,
  DateTime,
  Effect,
  String as EffectString,
  Option,
  pipe,
  Schema,
} from 'effect'

// HH:mm time format validation pattern
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

// Tagged error for invalid timezone
export class InvalidTimezoneError extends Schema.TaggedError<InvalidTimezoneError>()(
  'InvalidTimezoneError',
  { timezone: Schema.String }
) {}

// Tagged error for invalid time format
export class InvalidTimeFormatError extends Schema.TaggedError<InvalidTimeFormatError>()(
  'InvalidTimeFormatError',
  { time: Schema.String }
) {}

// Schema for validating HH:mm time format
export const TimeString = Schema.String.pipe(
  Schema.pattern(TIME_PATTERN, {
    message: () => 'Time must be in HH:mm format (00:00-23:59)',
  })
)

export type TimeString = typeof TimeString.Type

// Validate an IANA timezone string using Effect's DateTime module
export const validateTimezone = (
  timezone: string
): Effect.Effect<string, InvalidTimezoneError> =>
  Effect.gen(function* () {
    const result = DateTime.zoneMakeNamed(timezone)
    if (result._tag === 'None') {
      return yield* Effect.fail(new InvalidTimezoneError({ timezone }))
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
export const DEFAULT_TIMEZONE = 'UTC'
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
