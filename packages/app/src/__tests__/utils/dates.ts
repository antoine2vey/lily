import { DateTime } from 'effect'

/**
 * Test utilities for date handling.
 * These functions replace native Date usage in tests with Effect DateTime equivalents.
 */

/**
 * Get current time as native Date for test mocks.
 * Use instead of `new Date()` in test fixtures.
 */
export const mockNow = (): Date => DateTime.toDateUtc(DateTime.unsafeNow())

/**
 * Create a mock Date from various inputs.
 * Use instead of `new Date(input)` in test fixtures.
 *
 * @param input - Optional ISO string or epoch millis. If undefined, returns current time.
 */
export const mockDate = (input?: string | number): Date =>
  input === undefined
    ? mockNow()
    : DateTime.toDateUtc(DateTime.unsafeMake(input))

/**
 * Create a mock Date in the past.
 * Use instead of `new Date(Date.now() - ms)` patterns.
 *
 * @param amount - Number of time units to subtract
 * @param unit - Time unit: 'hours', 'days', or 'minutes' (default: 'days')
 */
export const mockDateAgo = (
  amount: number,
  unit: 'hours' | 'days' | 'minutes' = 'days'
): Date =>
  DateTime.toDateUtc(
    DateTime.subtract(DateTime.unsafeNow(), { [unit]: amount })
  )

/**
 * Create a mock Date in the future.
 * Use instead of `date.setDate(date.getDate() + n)` patterns.
 *
 * @param amount - Number of time units to add
 * @param unit - Time unit: 'hours', 'days', or 'minutes' (default: 'days')
 */
export const mockDateFuture = (
  amount: number,
  unit: 'hours' | 'days' | 'minutes' = 'days'
): Date =>
  DateTime.toDateUtc(DateTime.add(DateTime.unsafeNow(), { [unit]: amount }))

/**
 * Get current time as ISO string for test mocks.
 * Use instead of `new Date().toISOString()` in test fixtures.
 */
export const mockIsoString = (): string =>
  DateTime.formatIso(DateTime.unsafeNow())

/**
 * Create an ISO string for a date in the past.
 * Use for creating mock API responses with past dates.
 *
 * @param amount - Number of time units to subtract
 * @param unit - Time unit: 'hours', 'days', or 'minutes' (default: 'days')
 */
export const mockIsoStringAgo = (
  amount: number,
  unit: 'hours' | 'days' | 'minutes' = 'days'
): string =>
  DateTime.formatIso(
    DateTime.subtract(DateTime.unsafeNow(), { [unit]: amount })
  )

/**
 * Create an ISO string for a date in the future.
 * Use for creating mock API responses with future dates.
 *
 * @param amount - Number of time units to add
 * @param unit - Time unit: 'hours', 'days', or 'minutes' (default: 'days')
 */
export const mockIsoStringFuture = (
  amount: number,
  unit: 'hours' | 'days' | 'minutes' = 'days'
): string =>
  DateTime.formatIso(DateTime.add(DateTime.unsafeNow(), { [unit]: amount }))

/**
 * Get current time as epoch milliseconds for test mocks.
 * Use instead of `Date.now()` in test fixtures.
 */
export const mockEpochMillis = (): number =>
  DateTime.toEpochMillis(DateTime.unsafeNow())

/**
 * Create a specific date for deterministic tests.
 * Useful when you need a known, fixed date value.
 *
 * @param year - Year
 * @param month - Month (1-12)
 * @param day - Day of month
 * @param hours - Hour (0-23), default 0
 * @param minutes - Minute (0-59), default 0
 */
export const mockFixedDate = (
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0
): Date =>
  DateTime.toDateUtc(
    DateTime.unsafeMake({
      year,
      month,
      day,
      hours,
      minutes,
      seconds: 0,
      millis: 0,
    })
  )

/**
 * Create a specific ISO string for deterministic tests.
 *
 * @param year - Year
 * @param month - Month (1-12)
 * @param day - Day of month
 * @param hours - Hour (0-23), default 0
 * @param minutes - Minute (0-59), default 0
 */
export const mockFixedIsoString = (
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0
): string =>
  DateTime.formatIso(
    DateTime.unsafeMake({
      year,
      month,
      day,
      hours,
      minutes,
      seconds: 0,
      millis: 0,
    })
  )
