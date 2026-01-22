import { Array, DateTime, Duration, Option, pipe } from 'effect'

// Day names for formatting
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Valid date input types from API or database.
 * Supports Date objects, ISO strings, or epoch milliseconds.
 */
export type DateInput = DateTime.DateTime.Input | null | undefined

/**
 * Parse a date input from API to DateTime.
 * Accepts Date objects, ISO strings, epoch milliseconds, or partial date parts.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @returns Option containing the parsed DateTime
 */
export const parseApiDate = (
  dateInput: DateInput
): Option.Option<DateTime.DateTime> =>
  pipe(Option.fromNullable(dateInput), Option.flatMap(DateTime.make))

/**
 * Get current time as DateTime.Utc (synchronous, uses Date.now()).
 *
 * @returns Current time as DateTime.Utc
 */
export const now = (): DateTime.Utc => DateTime.unsafeNow()

/**
 * Calculate days until a future date (positive) or days overdue (negative).
 *
 * @param target - Target DateTime to compare against current time
 * @returns Number of days (positive if future, negative if past)
 */
export const daysUntil = (target: DateTime.DateTime): number => {
  const current = DateTime.unsafeNow()
  const distanceMs = DateTime.distance(current, target)
  return Math.ceil(Duration.toDays(Duration.millis(distanceMs)))
}

/**
 * Calculate days between two dates.
 *
 * @param from - Start DateTime
 * @param to - End DateTime
 * @returns Number of days between the two dates
 */
export const daysBetween = (
  from: DateTime.DateTime,
  to: DateTime.DateTime
): number => {
  const distanceMs = DateTime.distance(from, to)
  return Math.abs(Math.ceil(Duration.toDays(Duration.millis(distanceMs))))
}

/**
 * Format date as day of week (e.g., "Monday").
 *
 * @param dateTime - DateTime to format
 * @returns Full day name
 */
export const formatDayOfWeek = (dateTime: DateTime.DateTime): string => {
  const parts = DateTime.toParts(dateTime)
  return pipe(
    Array.get(DAY_NAMES, parts.weekDay),
    Option.getOrElse(() => 'Unknown')
  )
}

/**
 * Format date as short day of week (e.g., "Mon").
 *
 * @param dateTime - DateTime to format
 * @returns Short day name
 */
export const formatDayOfWeekShort = (dateTime: DateTime.DateTime): string => {
  const parts = DateTime.toParts(dateTime)
  return pipe(
    Array.get(DAY_NAMES_SHORT, parts.weekDay),
    Option.getOrElse(() => 'Unknown')
  )
}

/**
 * Format for "Next: Monday" style display.
 *
 * @param dateTime - DateTime to format
 * @returns Formatted string like "Next: Monday"
 */
export const formatNextDate = (dateTime: DateTime.DateTime): string =>
  `Next: ${formatDayOfWeek(dateTime)}`

/**
 * Format relative time (e.g., "Just now", "2h ago", "Yesterday").
 *
 * @param dateTime - DateTime to format relative to now
 * @returns Human-readable relative time string
 */
export const formatRelativeTime = (dateTime: DateTime.DateTime): string => {
  const current = DateTime.unsafeNow()
  const distanceMs = DateTime.distance(dateTime, current)
  const duration = Duration.millis(distanceMs)

  const minutes = Math.floor(Duration.toMinutes(duration))
  const hours = Math.floor(Duration.toHours(duration))
  const days = Math.floor(Duration.toDays(duration))

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${String(minutes)}m ago`
  if (hours < 24) return `${String(hours)}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${String(days)} days ago`

  // For older dates, show the date
  const parts = DateTime.toParts(dateTime)
  return pipe(
    Array.get(MONTH_NAMES_SHORT, parts.month - 1),
    Option.map((month) => `${month} ${String(parts.day)}`),
    Option.getOrElse(() => 'Unknown')
  )
}

/**
 * Format locale time (e.g., "2:30 PM").
 *
 * @param dateTime - DateTime to format
 * @returns Formatted time string
 */
export const formatTime = (dateTime: DateTime.DateTime): string => {
  const parts = DateTime.toParts(dateTime)
  const hours = parts.hours
  const minutes = parts.minutes
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  const paddedMinutes = String(minutes).padStart(2, '0')
  return `${String(displayHours)}:${paddedMinutes} ${ampm}`
}

/**
 * Format short date (e.g., "Mon, Jan 15").
 *
 * @param dateTime - DateTime to format
 * @returns Formatted short date string
 */
export const formatShortDate = (dateTime: DateTime.DateTime): string => {
  const parts = DateTime.toParts(dateTime)
  const dayName = pipe(
    Array.get(DAY_NAMES_SHORT, parts.weekDay),
    Option.getOrElse(() => 'Unknown')
  )
  const monthName = pipe(
    Array.get(MONTH_NAMES_SHORT, parts.month - 1),
    Option.getOrElse(() => 'Unknown')
  )
  return `${dayName}, ${monthName} ${String(parts.day)}`
}

/**
 * Check if DateTime is today.
 *
 * @param dateTime - DateTime to check
 * @returns true if the DateTime is today
 */
export const isToday = (dateTime: DateTime.DateTime): boolean => {
  const current = DateTime.unsafeNow()
  const targetParts = DateTime.toParts(dateTime)
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
): number =>
  pipe(
    parseApiDate(dateInput),
    Option.map(daysUntil),
    Option.getOrElse(() => defaultValue)
  )

/**
 * Parse an API date and format it as "Next: [Day]".
 * Convenience function combining parseApiDate and formatNextDate.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param defaultValue - Value to return if date is invalid (default: "Not set")
 * @returns Formatted string like "Next: Monday", or defaultValue if invalid
 */
export const formatApiDateAsNextDate = (
  dateInput: DateInput,
  defaultValue = 'Not set'
): string =>
  pipe(
    parseApiDate(dateInput),
    Option.map(formatNextDate),
    Option.getOrElse(() => defaultValue)
  )
