import {
  Array,
  Effect,
  String as EffectString,
  Option,
  pipe,
  Schema,
} from 'effect'

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export class InvalidTimeFormatError extends Schema.TaggedError<
  InvalidTimeFormatError,
  { readonly brand: unique symbol }
>()('InvalidTimeFormatError', { time: Schema.String }) {}

export const TimeString = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(TIME_PATTERN, {
      message: 'Time must be in HH:mm format (00:00-23:59)',
    })
  )
)

export type TimeString = typeof TimeString.Type

export const validateTimeFormat = (
  time: string
): Effect.Effect<string, InvalidTimeFormatError> =>
  TIME_PATTERN.test(time)
    ? Effect.succeed(time)
    : Effect.fail(new InvalidTimeFormatError({ time }))

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
  if (startMinutes === endMinutes) return false

  // Wrapping window (e.g., 22:00 → 07:00)
  if (startMinutes > endMinutes) {
    return timeMinutes >= startMinutes || timeMinutes < endMinutes
  }

  // Non-wrapping window (e.g., 01:00 → 06:00)
  return timeMinutes >= startMinutes && timeMinutes < endMinutes
}
