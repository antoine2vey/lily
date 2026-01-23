import { DateTime, Duration, Option, pipe } from 'effect'

/**
 * Convert Effect DateTime to native JavaScript Date for locale formatting.
 * Uses toDateUtc() to get a standard Date object.
 */
const toNativeDate = (dateTime: DateTime.DateTime): Date =>
  DateTime.toDateUtc(dateTime)

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
  // Handle sign manually since Duration.millis doesn't preserve negative values
  const sign = distanceMs >= 0 ? 1 : -1
  const days = Duration.toDays(Duration.millis(Math.abs(distanceMs)))
  return sign * Math.ceil(days)
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
 * Format date as day of week (e.g., "Monday").
 * Uses user's locale for localized day names.
 *
 * @param dateTime - DateTime to format
 * @returns Full day name in user's locale
 */
export const formatDayOfWeek = (dateTime: DateTime.DateTime): string =>
  toNativeDate(dateTime).toLocaleDateString(undefined, { weekday: 'long' })

/**
 * Format date as short day of week (e.g., "Mon").
 * Uses user's locale for localized day names.
 *
 * @param dateTime - DateTime to format
 * @returns Short day name in user's locale
 */
export const formatDayOfWeekShort = (dateTime: DateTime.DateTime): string =>
  toNativeDate(dateTime).toLocaleDateString(undefined, { weekday: 'short' })

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
 * Falls back to locale-formatted date for older dates.
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

  // For older dates, show the date in user's locale
  return toNativeDate(dateTime).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format locale time (e.g., "2:30 PM" or "14:30" depending on locale).
 * Uses user's locale for localized time format.
 *
 * @param dateTime - DateTime to format
 * @returns Formatted time string in user's locale
 */
export const formatTime = (dateTime: DateTime.DateTime): string =>
  toNativeDate(dateTime).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * Format short date (e.g., "Mon, Jan 15").
 * Uses user's locale for localized date format.
 *
 * @param dateTime - DateTime to format
 * @returns Formatted short date string in user's locale
 */
export const formatShortDate = (dateTime: DateTime.DateTime): string =>
  toNativeDate(dateTime).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

/**
 * Check if DateTime is today.
 *
 * @param dateTime - DateTime to check
 * @param referenceDate - Reference DateTime (defaults to now)
 * @returns true if the DateTime is today
 */
export const isToday = (
  dateTime: DateTime.DateTime,
  referenceDate?: DateTime.DateTime
): boolean => {
  const current = referenceDate ?? DateTime.unsafeNow()
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
 * Get start of day (00:00:00.000) for a DateTime.
 *
 * @param dateTime - DateTime to get start of day for
 * @returns DateTime at 00:00:00.000 of the same day
 */
export const startOfDay = (dateTime: DateTime.DateTime): DateTime.DateTime => {
  const parts = DateTime.toParts(dateTime)
  return DateTime.unsafeMake({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hours: 0,
    minutes: 0,
    seconds: 0,
    millis: 0,
  })
}

/**
 * Get end of day (23:59:59.999) for a DateTime.
 *
 * @param dateTime - DateTime to get end of day for
 * @returns DateTime at 23:59:59.999 of the same day
 */
export const endOfDay = (dateTime: DateTime.DateTime): DateTime.DateTime => {
  const parts = DateTime.toParts(dateTime)
  return DateTime.unsafeMake({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hours: 23,
    minutes: 59,
    seconds: 59,
    millis: 999,
  })
}

/**
 * Get end of week (Sunday 23:59:59.999) for a DateTime.
 * Week ends on Sunday.
 *
 * @param dateTime - DateTime to get end of week for
 * @returns DateTime at Sunday 23:59:59.999 of the same week
 */
export const endOfWeek = (dateTime: DateTime.DateTime): DateTime.DateTime => {
  const parts = DateTime.toParts(dateTime)
  const dayOfWeek = parts.weekDay // 0 = Sunday, 1 = Monday, etc.
  const daysUntilSunday = 7 - dayOfWeek

  return DateTime.unsafeMake({
    year: parts.year,
    month: parts.month,
    day: parts.day + daysUntilSunday,
    hours: 23,
    minutes: 59,
    seconds: 59,
    millis: 999,
  })
}

/**
 * Check if a date is before the start of today (overdue by day).
 * Unlike isOverdue which checks against current time, this checks against start of today.
 *
 * @param dateTime - DateTime to check
 * @param referenceDate - Reference DateTime (defaults to now)
 * @returns true if the DateTime is before the start of today
 */
export const isOverdueByDay = (
  dateTime: DateTime.DateTime,
  referenceDate?: DateTime.DateTime
): boolean => {
  const reference = referenceDate ?? DateTime.unsafeNow()
  return DateTime.lessThan(dateTime, startOfDay(reference))
}

/**
 * Check if a DateTime is this week (after today, before end of week).
 *
 * @param dateTime - DateTime to check
 * @param referenceDate - Reference DateTime (defaults to now)
 * @returns true if the DateTime is this week but after today
 */
export const isThisWeek = (
  dateTime: DateTime.DateTime,
  referenceDate?: DateTime.DateTime
): boolean => {
  const reference = referenceDate ?? DateTime.unsafeNow()
  const weekEnd = endOfWeek(reference)
  const afterToday = DateTime.greaterThan(dateTime, endOfDay(reference))
  const beforeEndOfWeek = DateTime.lessThanOrEqualTo(dateTime, weekEnd)
  return afterToday && beforeEndOfWeek
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

/**
 * Get the current hour of day (0-23).
 *
 * @returns Current hour (0-23)
 */
export const getCurrentHour = (): number => {
  const current = DateTime.unsafeNow()
  return DateTime.toParts(current).hours
}

/**
 * Get time-based greeting based on current hour.
 *
 * @returns "Good morning", "Good afternoon", or "Good evening"
 */
export const getTimeBasedGreeting = (): string => {
  const hour = getCurrentHour()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Check if a DateTime is yesterday.
 *
 * @param dateTime - DateTime to check
 * @returns true if the DateTime is yesterday
 */
export const isYesterday = (dateTime: DateTime.DateTime): boolean => {
  const current = DateTime.unsafeNow()
  const yesterday = DateTime.subtract(current, { days: 1 })
  const targetParts = DateTime.toParts(dateTime)
  const yesterdayParts = DateTime.toParts(yesterday)
  return (
    targetParts.year === yesterdayParts.year &&
    targetParts.month === yesterdayParts.month &&
    targetParts.day === yesterdayParts.day
  )
}

/**
 * Format long date (e.g., "January 15, 2024").
 * Uses user's locale for localized date format.
 *
 * @param dateTime - DateTime to format
 * @returns Formatted long date string in user's locale
 */
export const formatLongDate = (dateTime: DateTime.DateTime): string =>
  toNativeDate(dateTime).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

/**
 * Format date with weekday (e.g., "Monday, Jan 15").
 * Uses user's locale for localized date format.
 *
 * @param dateTime - DateTime to format
 * @returns Formatted date with weekday in user's locale
 */
export const formatDateWithWeekday = (dateTime: DateTime.DateTime): string =>
  toNativeDate(dateTime).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

/**
 * Format member since date (e.g., "Jan 2024").
 * Uses user's locale for localized date format.
 *
 * @param dateTime - DateTime to format
 * @returns Formatted member since string in user's locale
 */
export const formatMemberSince = (dateTime: DateTime.DateTime): string =>
  toNativeDate(dateTime).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  })

/**
 * Format relative time with fallback to date (e.g., "2h ago" or "Jan 15").
 * Used for notifications and activity feeds.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param defaultValue - Value to return if date is invalid (default: "Unknown")
 * @returns Relative time or formatted date
 */
export const formatApiRelativeTime = (
  dateInput: DateInput,
  defaultValue = 'Unknown'
): string =>
  pipe(
    parseApiDate(dateInput),
    Option.map(formatRelativeTime),
    Option.getOrElse(() => defaultValue)
  )

/**
 * Format time from API date (e.g., "2:30 PM").
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param defaultValue - Value to return if date is invalid (default: "")
 * @returns Formatted time string
 */
export const formatApiTime = (
  dateInput: DateInput,
  defaultValue = ''
): string =>
  pipe(
    parseApiDate(dateInput),
    Option.map(formatTime),
    Option.getOrElse(() => defaultValue)
  )

/**
 * Get date group label for grouping items (e.g., "Today", "Yesterday", "Monday, Jan 15").
 *
 * @param dateTime - DateTime to get group label for
 * @returns Group label string
 */
export const getDateGroupLabel = (dateTime: DateTime.DateTime): string => {
  if (isToday(dateTime)) return 'Today'
  if (isYesterday(dateTime)) return 'Yesterday'
  return formatDateWithWeekday(dateTime)
}

/**
 * Get date group label from API date.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param defaultValue - Value to return if date is invalid (default: "Unknown")
 * @returns Group label string
 */
export const getApiDateGroupLabel = (
  dateInput: DateInput,
  defaultValue = 'Unknown'
): string =>
  pipe(
    parseApiDate(dateInput),
    Option.map(getDateGroupLabel),
    Option.getOrElse(() => defaultValue)
  )

/**
 * Format date for header display (e.g., "MONDAY, JAN 15" in uppercase).
 *
 * @param dateTime - DateTime to format
 * @returns Formatted uppercase date string
 */
export const formatDateHeader = (dateTime: DateTime.DateTime): string =>
  formatDateWithWeekday(dateTime).toUpperCase()
