import { DateTime, Option, pipe } from 'effect'

/**
 * Valid date input types from API or database.
 * Supports Date objects, ISO strings, or epoch milliseconds.
 */
export type DateInput = DateTime.DateTime.Input | null | undefined

/**
 * Convert Effect DateTime to native JavaScript Date.
 * Uses toDateUtc() to get a standard Date object.
 *
 * Exported for use by sibling modules (format.ts).
 */
export const toNativeDate = (dateTime: DateTime.DateTime): Date =>
  DateTime.toDateUtc(dateTime)

/**
 * Get epoch milliseconds for unique identifiers.
 * Use this instead of Date.now() for generating unique IDs.
 *
 * @returns Current time as epoch milliseconds
 */
export const nowAsEpochMillis = (): number =>
  DateTime.toEpochMillis(DateTime.unsafeNow())

/**
 * Get current time as ISO string.
 * Use this instead of new Date().toISOString()
 *
 * @returns Current time as ISO 8601 string
 */
export const nowAsIsoString = (): string =>
  DateTime.formatIso(DateTime.unsafeNow())

/**
 * Convert DateTime to ISO string.
 * Use this instead of date.toISOString()
 *
 * @param dt - DateTime to convert
 * @returns ISO 8601 formatted string
 */
export const toIsoString = (dt: DateTime.DateTime): string =>
  DateTime.formatIso(dt)

/**
 * Create a Date object for time picker with specified hours and minutes.
 * DateTimePicker requires native Date objects, so we create them via Effect DateTime.
 *
 * @param hours - Hour (0-23)
 * @param minutes - Minute (0-59)
 * @returns Native Date object for use with DateTimePicker
 */
export const makeTimePickerDate = (hours: number, minutes: number): Date => {
  // DateTimePicker displays dates in device local time,
  // so we create a Date where getHours()/getMinutes() return the desired values.
  // Using native Date constructor for DateTimePicker interop.
  const date = DateTime.toDateUtc(DateTime.unsafeNow())
  date.setHours(hours, minutes, 0, 0)
  return date
}

/**
 * Parse a DateTime and convert to native Date.
 * Useful for components that require native Date objects like AI SDK Message.createdAt.
 *
 * @param input - DateTime input (ISO string, epoch millis, Date, or DateTime parts)
 * @returns Option containing native Date
 */
export const parseToNativeDate = (
  input: DateTime.DateTime.Input
): Option.Option<Date> =>
  pipe(DateTime.make(input), Option.map(DateTime.toDateUtc))

/**
 * Parse a date input from API to DateTime.
 * Accepts Date objects, ISO strings, epoch milliseconds, or partial date parts.
 *
 * IMPORTANT: For Date objects, we use getTime() to extract UTC milliseconds
 * directly. This is necessary because DateTime.make(Date) interprets the
 * Date's local time representation, causing timezone offset issues.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @returns Option containing the parsed DateTime
 */
export const parseApiDate = (
  dateInput: DateInput
): Option.Option<DateTime.DateTime> =>
  pipe(
    Option.fromNullable(dateInput),
    Option.flatMap((input) =>
      input instanceof Date
        ? DateTime.make(input.getTime())
        : DateTime.make(input)
    )
  )

/**
 * Higher-order function to reduce parseApiDate -> Option.map -> Option.getOrElse boilerplate.
 * Creates a function that parses a DateInput, applies a formatter, and falls back to a default.
 */
export const formatApiDateWith =
  <A>(formatter: (dt: DateTime.DateTime) => A, defaultValue: A) =>
  (dateInput: DateInput): A =>
    pipe(
      parseApiDate(dateInput),
      Option.map(formatter),
      Option.getOrElse(() => defaultValue)
    )

/**
 * Get current time as DateTime.Utc (synchronous, uses Date.now()).
 *
 * @returns Current time as DateTime.Utc
 */
export const now = (): DateTime.Utc => DateTime.unsafeNow()

/**
 * Get current time as native JavaScript Date for database operations.
 * Use this instead of `new Date()` to comply with Effect-first policy.
 *
 * @returns Current time as native Date
 */
export const nowAsDate = (): Date => DateTime.toDateUtc(DateTime.unsafeNow())

/**
 * Get start of current month as Date.
 * Used for subscription period calculations.
 *
 * @returns First day of current month at 00:00:00.000
 */
export const startOfMonthAsDate = (): Date => {
  const current = DateTime.unsafeNow()
  const parts = DateTime.toParts(current)
  return DateTime.toDateUtc(
    DateTime.unsafeMake({
      year: parts.year,
      month: parts.month,
      day: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
      millis: 0,
    })
  )
}

/**
 * Get end of current month as Date.
 * Used for subscription period calculations.
 *
 * @returns Last day of current month at 23:59:59.999
 */
export const endOfMonthAsDate = (): Date => {
  const current = DateTime.unsafeNow()
  const parts = DateTime.toParts(current)
  // Get last day by going to next month day 0
  const lastDay = new Date(parts.year, parts.month, 0).getDate()
  return DateTime.toDateUtc(
    DateTime.unsafeMake({
      year: parts.year,
      month: parts.month,
      day: lastDay,
      hours: 23,
      minutes: 59,
      seconds: 59,
      millis: 999,
    })
  )
}

/**
 * Get date in the past by subtracting duration.
 * Used for cleanup operations (e.g., delete records older than 30 days).
 *
 * @param days - Number of days to subtract
 * @returns Date that many days in the past
 */
export const daysAgoAsDate = (days: number): Date =>
  DateTime.toDateUtc(DateTime.subtract(DateTime.unsafeNow(), { days }))

/**
 * Get date in the past by subtracting hours.
 *
 * @param hours - Number of hours to subtract
 * @returns Date that many hours in the past
 */
export const hoursAgoAsDate = (hours: number): Date =>
  DateTime.toDateUtc(DateTime.subtract(DateTime.unsafeNow(), { hours }))
