import {
  Array,
  DateTime,
  Duration,
  String as EffectString,
  Match,
  Option,
  pipe,
} from 'effect'

import { daysUntil, isToday, isYesterday } from './compare'
import {
  type DateInput,
  formatApiDateWith,
  parseApiDate,
  toIsoString,
  toNativeDate,
} from './parse'

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
 * Anchor a plain YYYY-MM-DD date key at noon UTC.
 *
 * Backend day keys carry no time. Anchoring at noon (not midnight) means that
 * even if a renderer formats in the device's local zone, the calendar date can
 * never roll backward/forward — noon UTC stays on the same date for every
 * practical offset. Returns None for an unparseable key.
 */
const plainDateAtUtcNoon = (
  isoDate: string
): Option.Option<DateTime.DateTime> => DateTime.make(`${isoDate}T12:00:00.000Z`)

/**
 * Format a plain YYYY-MM-DD date key as a short weekday (e.g. "Mon").
 *
 * Timezone-stable: the key is rendered as the literal calendar day it names,
 * independent of the device timezone. Use for calendar column headers and care
 * day-group labels that must match the API's local-day buckets exactly.
 *
 * @param isoDate - Date key in YYYY-MM-DD form
 * @param locale - Optional locale (e.g. 'fr', 'en-US')
 * @returns Short localized weekday, or the raw key if unparseable
 */
export const formatPlainDateWeekdayShort = (
  isoDate: string,
  locale?: Intl.LocalesArgument
): string =>
  pipe(
    plainDateAtUtcNoon(isoDate),
    Option.map((dt) =>
      toNativeDate(dt).toLocaleDateString(locale, {
        weekday: 'short',
        timeZone: 'UTC',
      })
    ),
    Option.getOrElse(() => isoDate)
  )

/**
 * Format a plain YYYY-MM-DD date key as a full weekday (e.g. "Monday").
 *
 * @param isoDate - Date key in YYYY-MM-DD form
 * @param locale - Optional locale (e.g. 'fr', 'en-US')
 * @returns Full localized weekday, or the raw key if unparseable
 */
export const formatPlainDateWeekday = (
  isoDate: string,
  locale?: Intl.LocalesArgument
): string =>
  pipe(
    plainDateAtUtcNoon(isoDate),
    Option.map((dt) =>
      toNativeDate(dt).toLocaleDateString(locale, {
        weekday: 'long',
        timeZone: 'UTC',
      })
    ),
    Option.getOrElse(() => isoDate)
  )

/**
 * Extract the day-of-month (1-31) from a plain YYYY-MM-DD date key.
 *
 * @param isoDate - Date key in YYYY-MM-DD form
 * @returns Day of month, or 0 if unparseable
 */
export const plainDateDayOfMonth = (isoDate: string): number =>
  pipe(
    plainDateAtUtcNoon(isoDate),
    Option.map((dt) => DateTime.toParts(dt).day),
    Option.getOrElse(() => 0)
  )

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

  if (Duration.lessThan(duration, Duration.minutes(1))) return { _tag: 'now' }
  if (Duration.lessThan(duration, Duration.hours(1)))
    return { _tag: 'minutes', value: minutes }
  if (Duration.lessThan(duration, Duration.days(1)))
    return { _tag: 'hours', value: hours }
  if (Duration.lessThan(duration, Duration.weeks(1)))
    return { _tag: 'days', value: days }

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

  return pipe(
    Match.value(result),
    Match.when({ _tag: 'now' }, () => 'Just now'),
    Match.when({ _tag: 'minutes' }, ({ value }) => `${String(value)}m ago`),
    Match.when({ _tag: 'hours' }, ({ value }) => `${String(value)}h ago`),
    Match.when({ _tag: 'days' }, ({ value }) =>
      value === 1 ? 'Yesterday' : `${String(value)} days ago`
    ),
    Match.when({ _tag: 'date' }, ({ formatted }) => formatted),
    Match.exhaustive
  )
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
 * Calendar breakdown of the elapsed time between two instants, as whole years,
 * months, and days (e.g. 1 year, 2 months and 3 days).
 */
export interface CalendarAge {
  years: number
  months: number
  days: number
}

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/** Number of days in a given 1-indexed month of a given year. */
const daysInMonth = (year: number, month: number): number =>
  pipe(
    Match.value(month),
    Match.when(2, () => (isLeapYear(year) ? 29 : 28)),
    Match.when(
      (m: number) => Array.contains([4, 6, 9, 11], m),
      () => 30
    ),
    Match.orElse(() => 31)
  )

/** The calendar month immediately preceding the given 1-indexed month. */
const previousMonth = (
  year: number,
  month: number
): { year: number; month: number } =>
  pipe(
    Match.value(month),
    Match.when(1, () => ({ year: year - 1, month: 12 })),
    Match.orElse((m: number) => ({ year, month: m - 1 }))
  )

/**
 * Compute the calendar age between two instants as whole years, months, and
 * days. Both inputs are read in their own zone, so pass same-zone DateTimes
 * (e.g. both UTC) for stable results. Future `to`/`from` pairs clamp to zero.
 *
 * @example
 * // ~33 days → { years: 0, months: 1, days: 2 }
 * getCalendarAge(from, to)
 */
export const getCalendarAge = (
  from: DateTime.DateTime,
  to: DateTime.DateTime
): CalendarAge => {
  const start = DateTime.toParts(from)
  const end = DateTime.toParts(to)

  let years = end.year - start.year
  let months = end.month - start.month
  let days = end.day - start.day

  if (days < 0) {
    months -= 1
    const borrow = previousMonth(end.year, end.month)
    days += daysInMonth(borrow.year, borrow.month)
  }

  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years < 0) {
    return { years: 0, months: 0, days: 0 }
  }

  return { years, months, days }
}

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
): string => formatApiDateWith(formatRelativeTime, defaultValue)(dateInput)

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
): string => formatApiDateWith(formatTime, defaultValue)(dateInput)

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
): string => formatApiDateWith(formatNextDate, defaultValue)(dateInput)

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
  return pipe(
    Match.value(hour),
    Match.when(
      (h) => h < 12,
      () => 'Good morning'
    ),
    Match.when(
      (h) => h < 17,
      () => 'Good afternoon'
    ),
    Match.orElse(() => 'Good evening')
  )
}

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
): string => EffectString.toUpperCase(formatDateWithWeekday(dateTime, locale))

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
