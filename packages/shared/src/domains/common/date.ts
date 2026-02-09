import {
  Array,
  DateTime,
  Duration,
  String as EffectString,
  Match,
  Option,
  pipe,
} from 'effect'

// ============================================================================
// Effect DateTime Interop Utilities
// These replace native Date methods while respecting DateTimePicker constraints
// ============================================================================

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
    ? DateTime.setZone(dateTime, DateTime.zoneUnsafeMakeNamed(timezone))
    : dateTime

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
      // For Date objects, use epoch milliseconds to avoid local timezone interpretation
      input instanceof Date
        ? DateTime.make(input.getTime())
        : DateTime.make(input)
    )
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

/**
 * Get start of today as Date in a specific timezone.
 *
 * @param timezone - IANA timezone string
 * @returns Start of today (00:00:00.000) in the specified timezone
 */
export const startOfTodayAsDate = (timezone = 'UTC'): Date => {
  const current = DateTime.setZone(
    DateTime.unsafeNow(),
    DateTime.zoneUnsafeMakeNamed(timezone)
  )
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
  const current = DateTime.setZone(
    DateTime.unsafeNow(),
    DateTime.zoneUnsafeMakeNamed(timezone)
  )
  const tomorrow = DateTime.add(current, { days: 1 })
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

/**
 * Calculate days until a future date (positive) or days overdue (negative).
 *
 * @param target - Target DateTime to compare against current time
 * @returns Number of days (positive if future, negative if past)
 */
export const daysUntil = (target: DateTime.DateTime): number => {
  // Truncate to start of day to compare at day granularity
  // This prevents "1 day overdue" when the target is earlier today
  const currentDay = DateTime.startOf(DateTime.unsafeNow(), 'day')
  const targetDay = DateTime.startOf(target, 'day')
  const distanceMs = DateTime.distance(currentDay, targetDay)
  // Handle sign manually since Duration.millis doesn't preserve negative values
  const sign = distanceMs >= 0 ? 1 : -1
  const days = Duration.toDays(Duration.millis(Math.abs(distanceMs)))
  return sign * Math.round(days)
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
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Full day name in user's locale
 */
export const formatDayOfWeek = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string =>
  toNativeDate(dateTime).toLocaleDateString(locale, { weekday: 'long' })

/**
 * Format date as short day of week (e.g., "Mon").
 * Uses user's locale for localized day names.
 *
 * @param dateTime - DateTime to format
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Short day name in user's locale
 */
export const formatDayOfWeekShort = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string =>
  toNativeDate(dateTime).toLocaleDateString(locale, { weekday: 'short' })

/**
 * Format for "Next: Monday" style display.
 *
 * @param dateTime - DateTime to format
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Formatted string like "Next: Monday"
 */
export const formatNextDate = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string => `Next: ${formatDayOfWeek(dateTime, locale)}`

/**
 * Relative time result types for localized formatting.
 */
export type RelativeTimeResult =
  | { readonly _tag: 'now' }
  | { readonly _tag: 'minutes'; readonly value: number }
  | { readonly _tag: 'hours'; readonly value: number }
  | { readonly _tag: 'days'; readonly value: number }
  | { readonly _tag: 'date'; readonly formatted: string }

/**
 * Get relative time data for a DateTime.
 * Returns structured data that can be formatted with i18next or other i18n libraries.
 *
 * @param dateTime - DateTime to compare relative to now
 * @param locale - Optional locale for date fallback formatting
 * @returns Structured relative time data
 *
 * @example
 * ```typescript
 * const result = getRelativeTime(dateTime)
 * pipe(
 *   Match.value(result),
 *   Match.when({ _tag: 'now' }, () => t('time.justNow')),
 *   Match.when({ _tag: 'minutes' }, ({ value }) => t('time.minutesAgo', { count: value })),
 *   Match.when({ _tag: 'hours' }, ({ value }) => t('time.hoursAgo', { count: value })),
 *   Match.when({ _tag: 'days' }, ({ value }) => t('time.daysAgo', { count: value })),
 *   Match.when({ _tag: 'date' }, ({ formatted }) => formatted),
 *   Match.exhaustive
 * )
 * ```
 */
export const getRelativeTime = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): RelativeTimeResult => {
  const current = DateTime.unsafeNow()
  const distanceMs = DateTime.distance(dateTime, current)
  const duration = Duration.millis(distanceMs)

  const minutes = Math.floor(Duration.toMinutes(duration))
  const hours = Math.floor(Duration.toHours(duration))
  const days = Math.floor(Duration.toDays(duration))

  if (minutes < 1) return { _tag: 'now' }
  if (minutes < 60) return { _tag: 'minutes', value: minutes }
  if (hours < 24) return { _tag: 'hours', value: hours }
  if (days < 7) return { _tag: 'days', value: days }

  // For older dates, return formatted date string
  return {
    _tag: 'date',
    formatted: toNativeDate(dateTime).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    }),
  }
}

/**
 * Format relative time (e.g., "Just now", "5m ago", "Yesterday").
 * Falls back to locale-formatted date for older dates.
 *
 * @deprecated Use `getRelativeTime` for localized formatting with i18next
 * @param dateTime - DateTime to format relative to now
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Human-readable relative time string (English only)
 */
export const formatRelativeTime = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string => {
  const result = getRelativeTime(dateTime, locale)

  if (result._tag === 'now') return 'Just now'
  if (result._tag === 'minutes') return `${String(result.value)}m ago`
  if (result._tag === 'hours') return `${String(result.value)}h ago`
  if (result._tag === 'days')
    return result.value === 1 ? 'Yesterday' : `${String(result.value)} days ago`
  return result.formatted
}

/**
 * Format locale time (e.g., "2:30 PM" or "14:30" depending on locale).
 * Uses user's locale for localized time format.
 *
 * @param dateTime - DateTime to format
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Formatted time string in user's locale
 */
export const formatTime = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string =>
  toNativeDate(dateTime).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * Format short date (e.g., "Mon, Jan 15").
 * Uses user's locale for localized date format.
 *
 * @param dateTime - DateTime to format
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Formatted short date string in user's locale
 */
export const formatShortDate = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string =>
  toNativeDate(dateTime).toLocaleDateString(locale, {
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
  referenceDate: DateTime.DateTime,
  timezone: string
): boolean => {
  const current = withTimeZone(referenceDate, timezone)
  const target = withTimeZone(dateTime, timezone)
  const targetParts = DateTime.toParts(target)
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
 * @returns DateTime at Sunday 23:59:59.999 of the same week
 */
export const endOfWeek = (
  dateTime: DateTime.DateTime,
  timezone: string
): DateTime.DateTime => {
  const zoned = withTimeZone(dateTime, timezone)
  const parts = DateTime.toParts(zoned)
  const dayOfWeek = parts.weekDay // 0 = Sunday, 1 = Monday, etc.
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
 * Check if a date is before the start of today (overdue by day).
 * Unlike isOverdue which checks against current time, this checks against start of today.
 *
 * @param dateTime - DateTime to check
 * @param referenceDate - Reference DateTime (defaults to now)
 * @returns true if the DateTime is before the start of today
 */
export const isOverdueByDay = (
  dateTime: DateTime.DateTime,
  referenceDate: DateTime.DateTime,
  timezone: string
): boolean => {
  return DateTime.lessThan(dateTime, startOfDay(referenceDate, timezone))
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
  referenceDate: DateTime.DateTime,
  timezone: string
): boolean => {
  const weekEnd = endOfWeek(referenceDate, timezone)
  const afterToday = DateTime.greaterThan(
    dateTime,
    endOfDay(referenceDate, timezone)
  )
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
export const isYesterday = (
  dateTime: DateTime.DateTime,
  timezone: string
): boolean => {
  const current = withTimeZone(DateTime.unsafeNow(), timezone)
  const yesterday = DateTime.subtract(current, { days: 1 })
  const target = withTimeZone(dateTime, timezone)
  const targetParts = DateTime.toParts(target)
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
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Formatted long date string in user's locale
 */
export const formatLongDate = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string =>
  toNativeDate(dateTime).toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

/**
 * Format date with weekday (e.g., "Monday, Jan 15").
 * Uses user's locale for localized date format.
 *
 * @param dateTime - DateTime to format
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Formatted date with weekday in user's locale
 */
export const formatDateWithWeekday = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string =>
  toNativeDate(dateTime).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

/**
 * Format member since date (e.g., "Jan 2024").
 * Uses user's locale for localized date format.
 *
 * @param dateTime - DateTime to format
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Formatted member since string in user's locale
 */
export const formatMemberSince = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string =>
  toNativeDate(dateTime).toLocaleDateString(locale, {
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
 * @param timezone - IANA timezone string
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Group label string
 */
export const getDateGroupLabel = (
  dateTime: DateTime.DateTime,
  timezone: string,
  locale?: Intl.LocalesArgument
): string => {
  if (isToday(dateTime, DateTime.unsafeNow(), timezone)) return 'Today'
  if (isYesterday(dateTime, timezone)) return 'Yesterday'
  return formatDateWithWeekday(dateTime, locale)
}

/**
 * Get date group label from API date.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param timezone - IANA timezone string
 * @param defaultValue - Value to return if date is invalid (default: "Unknown")
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Group label string
 */
export const getApiDateGroupLabel = (
  dateInput: DateInput,
  timezone: string,
  defaultValue = 'Unknown',
  locale?: Intl.LocalesArgument
): string =>
  pipe(
    parseApiDate(dateInput),
    Option.map((dt) => getDateGroupLabel(dt, timezone, locale)),
    Option.getOrElse(() => defaultValue)
  )

/**
 * Format date for header display (e.g., "MONDAY, JAN 15" in uppercase).
 *
 * @param dateTime - DateTime to format
 * @param locale - Optional locale (e.g., 'fr', 'en-US')
 * @returns Formatted uppercase date string
 */
export const formatDateHeader = (
  dateTime: DateTime.DateTime,
  locale?: Intl.LocalesArgument
): string => formatDateWithWeekday(dateTime, locale).toUpperCase()

/**
 * Format a date input to ISO date string (YYYY-MM-DD).
 * Useful for displaying dates in a consistent format.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param defaultValue - Value to return if date is invalid (default: "Never")
 * @returns ISO date string (YYYY-MM-DD) or defaultValue
 */
export const formatIsoDate = (
  dateInput: DateInput,
  defaultValue = 'Never'
): string =>
  pipe(
    parseApiDate(dateInput),
    Option.map(toIsoString),
    Option.flatMap((iso) => Array.head(EffectString.split(iso, 'T'))),
    Option.getOrElse(() => defaultValue)
  )

/**
 * Format days until a date as a human-readable string.
 * Returns strings like "Today", "Tomorrow", "In 3 days", "2 days overdue".
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param defaultValue - Value to return if date is invalid (default: "Not scheduled")
 * @returns Human-readable string describing days until the date
 */
export const formatDaysUntilHuman = (
  dateInput: DateInput,
  defaultValue = 'Not scheduled'
): string =>
  pipe(
    parseApiDate(dateInput),
    Option.map(daysUntil),
    Option.match({
      onNone: () => defaultValue,
      onSome: (days) =>
        pipe(
          Match.value(days),
          Match.when(
            (d) => d < 0,
            (d) => `${Math.abs(d)} days overdue`
          ),
          Match.when(0, () => 'Today'),
          Match.when(1, () => 'Tomorrow'),
          Match.orElse((d) => `In ${d} days`)
        ),
    })
  )

/**
 * Calculate days since a date (days between a past date and now).
 * Uses floor rounding so same-day returns 0, yesterday returns 1, etc.
 * Always returns a non-negative number.
 *
 * @param dateInput - Date input (Date, string, number, or null/undefined)
 * @param defaultValue - Value to return if date is invalid (default: 0)
 * @returns Number of complete days since the date
 */
export const daysSince = (dateInput: DateInput, defaultValue = 0): number =>
  pipe(
    parseApiDate(dateInput),
    Option.map((pastDate) => {
      const distanceMs = DateTime.distance(pastDate, now())
      return Math.floor(Duration.toDays(Duration.millis(Math.abs(distanceMs))))
    }),
    Option.getOrElse(() => defaultValue)
  )
