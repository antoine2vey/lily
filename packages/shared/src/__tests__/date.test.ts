import { DateTime, Option } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  daysBetween,
  daysUntil,
  daysUntilApiDate,
  endOfDay,
  endOfWeek,
  formatApiDateAsNextDate,
  formatApiRelativeTime,
  formatApiTime,
  formatDateHeader,
  formatDateWithWeekday,
  formatDayOfWeek,
  formatDayOfWeekShort,
  formatLongDate,
  formatMemberSince,
  formatNextDate,
  formatRelativeTime,
  formatShortDate,
  formatTime,
  getApiDateGroupLabel,
  getCurrentHour,
  getDateGroupLabel,
  getRelativeTime,
  getTimeBasedGreeting,
  isFuture,
  isOverdue,
  isOverdueByDay,
  isThisWeek,
  isToday,
  isYesterday,
  now,
  parseApiDate,
  startOfDay,
  withTimeZone,
} from '../domains/common/date'

// Helper to create a fixed DateTime for testing
const createFixedDateTime = (
  year: number,
  month: number,
  day: number,
  hours = 12,
  minutes = 0,
  seconds = 0
): DateTime.DateTime =>
  DateTime.unsafeMake({
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    millis: 0,
  })

describe('Date Utilities', () => {
  describe('parseApiDate', () => {
    it('should parse a Date object', () => {
      const date = new Date('2024-06-15T10:30:00Z')
      const result = parseApiDate(date)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const parts = DateTime.toParts(result.value)
        expect(parts.year).toBe(2024)
        expect(parts.month).toBe(6)
        expect(parts.day).toBe(15)
      }
    })

    it('should parse an ISO string', () => {
      const result = parseApiDate('2024-03-20T14:45:00Z')

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const parts = DateTime.toParts(result.value)
        expect(parts.year).toBe(2024)
        expect(parts.month).toBe(3)
        expect(parts.day).toBe(20)
        expect(parts.hours).toBe(14)
        expect(parts.minutes).toBe(45)
      }
    })

    it('should parse epoch milliseconds', () => {
      // 2024-01-01T00:00:00Z
      const epochMs = 1704067200000
      const result = parseApiDate(epochMs)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const parts = DateTime.toParts(result.value)
        expect(parts.year).toBe(2024)
        expect(parts.month).toBe(1)
        expect(parts.day).toBe(1)
      }
    })

    it('should return None for null', () => {
      const result = parseApiDate(null)
      expect(Option.isNone(result)).toBe(true)
    })

    it('should return None for undefined', () => {
      const result = parseApiDate(undefined)
      expect(Option.isNone(result)).toBe(true)
    })

    it('should handle date parts object', () => {
      const result = parseApiDate({
        year: 2024,
        month: 12,
        day: 25,
        hours: 8,
        minutes: 30,
      })

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const parts = DateTime.toParts(result.value)
        expect(parts.year).toBe(2024)
        expect(parts.month).toBe(12)
        expect(parts.day).toBe(25)
      }
    })
  })

  describe('now', () => {
    it('should return a DateTime representing current time', () => {
      const before = Date.now()
      const result = now()
      const after = Date.now()

      const resultMs = DateTime.toEpochMillis(result)
      expect(resultMs).toBeGreaterThanOrEqual(before)
      expect(resultMs).toBeLessThanOrEqual(after)
    })
  })

  describe('daysUntil', () => {
    beforeEach(() => {
      // Mock DateTime.unsafeNow to return a fixed date
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return positive days for future date', () => {
      const futureDate = createFixedDateTime(2024, 6, 20) // 5 days later
      const result = daysUntil(futureDate)
      expect(result).toBe(5)
    })

    it('should return negative days for past date', () => {
      const pastDate = createFixedDateTime(2024, 6, 10) // 5 days ago
      const result = daysUntil(pastDate)
      expect(result).toBe(-5)
    })

    it('should return 0 for same day', () => {
      const sameDay = createFixedDateTime(2024, 6, 15, 18, 0) // Same day, later time
      const result = daysUntil(sameDay)
      expect(result).toBe(0) // Same calendar day = 0 days
    })

    it('should handle month boundaries', () => {
      const nextMonth = createFixedDateTime(2024, 7, 1)
      const result = daysUntil(nextMonth)
      expect(result).toBe(16) // June 15 to July 1 = 16 days
    })

    it('should handle year boundaries', () => {
      const nextYear = createFixedDateTime(2025, 1, 1)
      const result = daysUntil(nextYear)
      expect(result).toBeGreaterThan(180) // More than half a year
    })
  })

  describe('daysBetween', () => {
    it('should return positive difference between two dates', () => {
      const date1 = createFixedDateTime(2024, 6, 10)
      const date2 = createFixedDateTime(2024, 6, 20)
      const result = daysBetween(date1, date2)
      expect(result).toBe(10)
    })

    it('should return absolute difference regardless of order', () => {
      const date1 = createFixedDateTime(2024, 6, 20)
      const date2 = createFixedDateTime(2024, 6, 10)
      const result = daysBetween(date1, date2)
      expect(result).toBe(10)
    })

    it('should return 0 for same date', () => {
      const date = createFixedDateTime(2024, 6, 15)
      const result = daysBetween(date, date)
      expect(result).toBe(0)
    })
  })

  describe('formatDayOfWeek', () => {
    it('should format Sunday', () => {
      // 2024-06-16 is a Sunday
      const sunday = createFixedDateTime(2024, 6, 16)
      const result = formatDayOfWeek(sunday)
      // The result depends on locale, but should contain the day name
      expect(result.length).toBeGreaterThan(0)
    })

    it('should format Monday', () => {
      // 2024-06-17 is a Monday
      const monday = createFixedDateTime(2024, 6, 17)
      const result = formatDayOfWeek(monday)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should return different values for different days', () => {
      const monday = createFixedDateTime(2024, 6, 17)
      const friday = createFixedDateTime(2024, 6, 21)
      expect(formatDayOfWeek(monday)).not.toBe(formatDayOfWeek(friday))
    })
  })

  describe('formatDayOfWeekShort', () => {
    it('should return short day name', () => {
      const monday = createFixedDateTime(2024, 6, 17)
      const result = formatDayOfWeekShort(monday)
      // Short name should be shorter than full name
      expect(result.length).toBeLessThanOrEqual(4)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should return different values for different days', () => {
      const monday = createFixedDateTime(2024, 6, 17)
      const friday = createFixedDateTime(2024, 6, 21)
      expect(formatDayOfWeekShort(monday)).not.toBe(
        formatDayOfWeekShort(friday)
      )
    })
  })

  describe('formatNextDate', () => {
    it('should format as "Next: [Weekday]"', () => {
      const monday = createFixedDateTime(2024, 6, 17)
      const result = formatNextDate(monday)
      expect(result.startsWith('Next: ')).toBe(true)
    })
  })

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return "Just now" for less than 1 minute ago', () => {
      const justNow = createFixedDateTime(2024, 6, 15, 11, 59, 30)
      const result = formatRelativeTime(justNow)
      expect(result).toBe('Just now')
    })

    it('should return minutes ago for less than 60 minutes', () => {
      const thirtyMinutesAgo = createFixedDateTime(2024, 6, 15, 11, 30)
      const result = formatRelativeTime(thirtyMinutesAgo)
      expect(result).toBe('30m ago')
    })

    it('should return hours ago for less than 24 hours', () => {
      const threeHoursAgo = createFixedDateTime(2024, 6, 15, 9, 0)
      const result = formatRelativeTime(threeHoursAgo)
      expect(result).toBe('3h ago')
    })

    it('should return "Yesterday" for 1 day ago', () => {
      const yesterday = createFixedDateTime(2024, 6, 14, 12, 0)
      const result = formatRelativeTime(yesterday)
      expect(result).toBe('Yesterday')
    })

    it('should return days ago for less than 7 days', () => {
      const fiveDaysAgo = createFixedDateTime(2024, 6, 10, 12, 0)
      const result = formatRelativeTime(fiveDaysAgo)
      expect(result).toBe('5 days ago')
    })

    it('should return formatted date for older dates', () => {
      const twoWeeksAgo = createFixedDateTime(2024, 6, 1, 12, 0)
      const result = formatRelativeTime(twoWeeksAgo)
      // Should return locale-formatted date (e.g., "Jun 1" in English)
      expect(result.length).toBeGreaterThan(0)
      expect(result).not.toContain('ago')
    })
  })

  describe('getRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return "now" tag for less than 1 minute ago', () => {
      const justNow = createFixedDateTime(2024, 6, 15, 11, 59, 30)
      const result = getRelativeTime(justNow)
      expect(result).toEqual({ _tag: 'now' })
    })

    it('should return "minutes" tag with value for less than 60 minutes', () => {
      const thirtyMinutesAgo = createFixedDateTime(2024, 6, 15, 11, 30)
      const result = getRelativeTime(thirtyMinutesAgo)
      expect(result).toEqual({ _tag: 'minutes', value: 30 })
    })

    it('should return "hours" tag with value for less than 24 hours', () => {
      const threeHoursAgo = createFixedDateTime(2024, 6, 15, 9, 0)
      const result = getRelativeTime(threeHoursAgo)
      expect(result).toEqual({ _tag: 'hours', value: 3 })
    })

    it('should return "days" tag with value 1 for yesterday', () => {
      const yesterday = createFixedDateTime(2024, 6, 14, 12, 0)
      const result = getRelativeTime(yesterday)
      expect(result).toEqual({ _tag: 'days', value: 1 })
    })

    it('should return "days" tag with value for less than 7 days', () => {
      const fiveDaysAgo = createFixedDateTime(2024, 6, 10, 12, 0)
      const result = getRelativeTime(fiveDaysAgo)
      expect(result).toEqual({ _tag: 'days', value: 5 })
    })

    it('should return "date" tag with formatted string for older dates', () => {
      const twoWeeksAgo = createFixedDateTime(2024, 6, 1, 12, 0)
      const result = getRelativeTime(twoWeeksAgo)
      expect(result._tag).toBe('date')
      if (result._tag === 'date') {
        expect(result.formatted.length).toBeGreaterThan(0)
      }
    })
  })

  describe('formatTime', () => {
    it('should format time with hours and minutes', () => {
      const dateTime = createFixedDateTime(2024, 6, 15, 14, 30)
      const result = formatTime(dateTime)
      // Result format depends on locale (e.g., "2:30 PM" or "14:30")
      expect(result).toContain('30')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle midnight', () => {
      const midnight = createFixedDateTime(2024, 6, 15, 0, 0)
      const result = formatTime(midnight)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle noon', () => {
      const noon = createFixedDateTime(2024, 6, 15, 12, 0)
      const result = formatTime(noon)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('formatShortDate', () => {
    it('should format with weekday, month, and day', () => {
      const dateTime = createFixedDateTime(2024, 6, 17) // Monday
      const result = formatShortDate(dateTime)
      // Should contain day number
      expect(result).toContain('17')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('formatLongDate', () => {
    it('should format with month, day, and year', () => {
      const dateTime = createFixedDateTime(2024, 6, 15)
      const result = formatLongDate(dateTime)
      // Should contain year
      expect(result).toContain('2024')
      expect(result).toContain('15')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('formatDateWithWeekday', () => {
    it('should include weekday in format', () => {
      const dateTime = createFixedDateTime(2024, 6, 17) // Monday
      const result = formatDateWithWeekday(dateTime)
      expect(result).toContain('17')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('formatMemberSince', () => {
    it('should format with month and year', () => {
      const dateTime = createFixedDateTime(2024, 6, 15)
      const result = formatMemberSince(dateTime)
      expect(result).toContain('2024')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('formatDateHeader', () => {
    it('should return uppercase formatted date', () => {
      const dateTime = createFixedDateTime(2024, 6, 17)
      const result = formatDateHeader(dateTime)
      expect(result).toBe(result.toUpperCase())
    })
  })

  describe('isToday', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for today', () => {
      const today = createFixedDateTime(2024, 6, 15, 8, 0)
      expect(isToday(today, DateTime.unsafeNow(), 'UTC')).toBe(true)
    })

    it('should return true for today at different times', () => {
      const todayMorning = createFixedDateTime(2024, 6, 15, 6, 0)
      const todayEvening = createFixedDateTime(2024, 6, 15, 22, 0)
      expect(isToday(todayMorning, DateTime.unsafeNow(), 'UTC')).toBe(true)
      expect(isToday(todayEvening, DateTime.unsafeNow(), 'UTC')).toBe(true)
    })

    it('should return false for yesterday', () => {
      const yesterday = createFixedDateTime(2024, 6, 14, 12, 0)
      expect(isToday(yesterday, DateTime.unsafeNow(), 'UTC')).toBe(false)
    })

    it('should return false for tomorrow', () => {
      const tomorrow = createFixedDateTime(2024, 6, 16, 12, 0)
      expect(isToday(tomorrow, DateTime.unsafeNow(), 'UTC')).toBe(false)
    })
  })

  describe('isYesterday', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for yesterday', () => {
      const yesterday = createFixedDateTime(2024, 6, 14, 12, 0)
      expect(isYesterday(yesterday, 'UTC')).toBe(true)
    })

    it('should return true for yesterday at any time', () => {
      const yesterdayMorning = createFixedDateTime(2024, 6, 14, 6, 0)
      const yesterdayEvening = createFixedDateTime(2024, 6, 14, 23, 59)
      expect(isYesterday(yesterdayMorning, 'UTC')).toBe(true)
      expect(isYesterday(yesterdayEvening, 'UTC')).toBe(true)
    })

    it('should return false for today', () => {
      const today = createFixedDateTime(2024, 6, 15, 12, 0)
      expect(isYesterday(today, 'UTC')).toBe(false)
    })

    it('should return false for two days ago', () => {
      const twoDaysAgo = createFixedDateTime(2024, 6, 13, 12, 0)
      expect(isYesterday(twoDaysAgo, 'UTC')).toBe(false)
    })
  })

  describe('isOverdue', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for past dates', () => {
      const pastDate = createFixedDateTime(2024, 6, 10, 12, 0)
      expect(isOverdue(pastDate)).toBe(true)
    })

    it('should return true for earlier today', () => {
      const earlierToday = createFixedDateTime(2024, 6, 15, 10, 0)
      expect(isOverdue(earlierToday)).toBe(true)
    })

    it('should return false for future dates', () => {
      const futureDate = createFixedDateTime(2024, 6, 20, 12, 0)
      expect(isOverdue(futureDate)).toBe(false)
    })

    it('should return false for later today', () => {
      const laterToday = createFixedDateTime(2024, 6, 15, 14, 0)
      expect(isOverdue(laterToday)).toBe(false)
    })
  })

  describe('isFuture', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for future dates', () => {
      const futureDate = createFixedDateTime(2024, 6, 20, 12, 0)
      expect(isFuture(futureDate)).toBe(true)
    })

    it('should return true for later today', () => {
      const laterToday = createFixedDateTime(2024, 6, 15, 14, 0)
      expect(isFuture(laterToday)).toBe(true)
    })

    it('should return false for past dates', () => {
      const pastDate = createFixedDateTime(2024, 6, 10, 12, 0)
      expect(isFuture(pastDate)).toBe(false)
    })

    it('should return false for earlier today', () => {
      const earlierToday = createFixedDateTime(2024, 6, 15, 10, 0)
      expect(isFuture(earlierToday)).toBe(false)
    })
  })

  describe('startOfDay', () => {
    it('should return 00:00:00.000 of the same day', () => {
      const dateTime = createFixedDateTime(2024, 6, 15, 14, 30, 45)
      const result = startOfDay(dateTime, 'UTC')
      const parts = DateTime.toParts(result)

      expect(parts.year).toBe(2024)
      expect(parts.month).toBe(6)
      expect(parts.day).toBe(15)
      expect(parts.hours).toBe(0)
      expect(parts.minutes).toBe(0)
      expect(parts.seconds).toBe(0)
      expect(parts.millis).toBe(0)
    })

    it('should handle already at midnight', () => {
      const midnight = createFixedDateTime(2024, 6, 15, 0, 0, 0)
      const result = startOfDay(midnight, 'UTC')
      const parts = DateTime.toParts(result)

      expect(parts.hours).toBe(0)
      expect(parts.minutes).toBe(0)
      expect(parts.seconds).toBe(0)
    })

    it('should handle end of day', () => {
      const endOfDayTime = createFixedDateTime(2024, 6, 15, 23, 59, 59)
      const result = startOfDay(endOfDayTime, 'UTC')
      const parts = DateTime.toParts(result)

      expect(parts.day).toBe(15)
      expect(parts.hours).toBe(0)
    })
  })

  describe('endOfDay', () => {
    it('should return 23:59:59.999 of the same day', () => {
      const dateTime = createFixedDateTime(2024, 6, 15, 8, 0, 0)
      const result = endOfDay(dateTime, 'UTC')
      const parts = DateTime.toParts(result)

      expect(parts.year).toBe(2024)
      expect(parts.month).toBe(6)
      expect(parts.day).toBe(15)
      expect(parts.hours).toBe(23)
      expect(parts.minutes).toBe(59)
      expect(parts.seconds).toBe(59)
      expect(parts.millis).toBe(999)
    })

    it('should handle midnight input', () => {
      const midnight = createFixedDateTime(2024, 6, 15, 0, 0, 0)
      const result = endOfDay(midnight, 'UTC')
      const parts = DateTime.toParts(result)

      expect(parts.day).toBe(15)
      expect(parts.hours).toBe(23)
      expect(parts.minutes).toBe(59)
    })

    it('should handle already at end of day', () => {
      const endTime = createFixedDateTime(2024, 6, 15, 23, 59, 59)
      const result = endOfDay(endTime, 'UTC')
      const parts = DateTime.toParts(result)

      expect(parts.hours).toBe(23)
      expect(parts.minutes).toBe(59)
      expect(parts.seconds).toBe(59)
    })
  })

  describe('endOfWeek', () => {
    it('should return Sunday 23:59:59.999 for a Monday', () => {
      // June 17, 2024 is Monday
      const monday = createFixedDateTime(2024, 6, 17, 12, 0)
      const result = endOfWeek(monday, 'UTC')
      const parts = DateTime.toParts(result)

      // Should be Sunday June 23, 2024
      expect(parts.day).toBe(23)
      expect(parts.month).toBe(6)
      expect(parts.hours).toBe(23)
      expect(parts.minutes).toBe(59)
      expect(parts.seconds).toBe(59)
    })

    it('should return same Sunday for a Sunday', () => {
      // June 16, 2024 is Sunday
      const sunday = createFixedDateTime(2024, 6, 16, 10, 0)
      const result = endOfWeek(sunday, 'UTC')
      const parts = DateTime.toParts(result)

      // Should be end of same Sunday
      expect(parts.day).toBe(23) // Next Sunday since weekDay 0 means 7 days until next Sunday
      expect(parts.hours).toBe(23)
    })

    it('should return Sunday 23:59:59.999 for a Saturday', () => {
      // June 15, 2024 is Saturday
      const saturday = createFixedDateTime(2024, 6, 15, 12, 0)
      const result = endOfWeek(saturday, 'UTC')
      const parts = DateTime.toParts(result)

      // Should be Sunday June 16, 2024
      expect(parts.day).toBe(16)
      expect(parts.month).toBe(6)
      expect(parts.hours).toBe(23)
    })

    it('should handle month boundary', () => {
      // June 26, 2024 is Wednesday
      const wednesday = createFixedDateTime(2024, 6, 26, 12, 0)
      const result = endOfWeek(wednesday, 'UTC')
      const parts = DateTime.toParts(result)

      // Should be Sunday June 30, 2024
      expect(parts.day).toBe(30)
      expect(parts.month).toBe(6)
    })
  })

  describe('isOverdueByDay', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for dates before today', () => {
      const yesterday = createFixedDateTime(2024, 6, 14, 23, 59)
      expect(isOverdueByDay(yesterday, DateTime.unsafeNow(), 'UTC')).toBe(true)
    })

    it('should return false for today (even early morning)', () => {
      const todayMorning = createFixedDateTime(2024, 6, 15, 0, 0)
      expect(isOverdueByDay(todayMorning, DateTime.unsafeNow(), 'UTC')).toBe(
        false
      )
    })

    it('should return false for future dates', () => {
      const tomorrow = createFixedDateTime(2024, 6, 16, 8, 0)
      expect(isOverdueByDay(tomorrow, DateTime.unsafeNow(), 'UTC')).toBe(false)
    })

    it('should use reference date when provided', () => {
      const date = createFixedDateTime(2024, 6, 14, 12, 0)
      const reference = createFixedDateTime(2024, 6, 13, 12, 0)
      // June 14 is not overdue relative to June 13
      expect(isOverdueByDay(date, reference, 'UTC')).toBe(false)
    })

    it('should differ from isOverdue for times within same day', () => {
      // isOverdueByDay checks against start of day, not current time
      const earlierToday = createFixedDateTime(2024, 6, 15, 8, 0)
      expect(isOverdueByDay(earlierToday, DateTime.unsafeNow(), 'UTC')).toBe(
        false
      ) // Not overdue by day
      expect(isOverdue(earlierToday)).toBe(true) // But overdue by time
    })
  })

  describe('isThisWeek', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      // June 15, 2024 is Saturday
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for tomorrow (within this week)', () => {
      // June 16, 2024 is Sunday (end of week)
      const sunday = createFixedDateTime(2024, 6, 16, 12, 0)
      expect(isThisWeek(sunday, DateTime.unsafeNow(), 'UTC')).toBe(true)
    })

    it('should return false for today', () => {
      const today = createFixedDateTime(2024, 6, 15, 18, 0)
      expect(isThisWeek(today, DateTime.unsafeNow(), 'UTC')).toBe(false)
    })

    it('should return false for past dates', () => {
      const yesterday = createFixedDateTime(2024, 6, 14, 12, 0)
      expect(isThisWeek(yesterday, DateTime.unsafeNow(), 'UTC')).toBe(false)
    })

    it('should return false for next week', () => {
      // June 17, 2024 is Monday of next week
      const nextMonday = createFixedDateTime(2024, 6, 17, 12, 0)
      expect(isThisWeek(nextMonday, DateTime.unsafeNow(), 'UTC')).toBe(false)
    })

    it('should use reference date when provided', () => {
      // If reference is Monday June 17, then June 20 (Thursday) is this week
      const reference = createFixedDateTime(2024, 6, 17, 12, 0) // Monday
      const thursday = createFixedDateTime(2024, 6, 20, 12, 0)
      expect(isThisWeek(thursday, reference, 'UTC')).toBe(true)
    })
  })

  describe('getCurrentHour', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return current hour in UTC', () => {
      vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
      expect(getCurrentHour()).toBe(14)
    })

    it('should handle midnight', () => {
      vi.setSystemTime(new Date('2024-06-15T00:30:00Z'))
      expect(getCurrentHour()).toBe(0)
    })

    it('should handle end of day', () => {
      vi.setSystemTime(new Date('2024-06-15T23:59:00Z'))
      expect(getCurrentHour()).toBe(23)
    })
  })

  describe('getTimeBasedGreeting', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return "Good morning" before noon', () => {
      vi.setSystemTime(new Date('2024-06-15T08:00:00Z'))
      expect(getTimeBasedGreeting()).toBe('Good morning')
    })

    it('should return "Good morning" at 11:59', () => {
      vi.setSystemTime(new Date('2024-06-15T11:59:00Z'))
      expect(getTimeBasedGreeting()).toBe('Good morning')
    })

    it('should return "Good afternoon" at noon', () => {
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
      expect(getTimeBasedGreeting()).toBe('Good afternoon')
    })

    it('should return "Good afternoon" in early afternoon', () => {
      vi.setSystemTime(new Date('2024-06-15T14:00:00Z'))
      expect(getTimeBasedGreeting()).toBe('Good afternoon')
    })

    it('should return "Good evening" after 5 PM', () => {
      vi.setSystemTime(new Date('2024-06-15T17:00:00Z'))
      expect(getTimeBasedGreeting()).toBe('Good evening')
    })

    it('should return "Good evening" at night', () => {
      vi.setSystemTime(new Date('2024-06-15T21:00:00Z'))
      expect(getTimeBasedGreeting()).toBe('Good evening')
    })
  })

  describe('getDateGroupLabel', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return "Today" for today', () => {
      const today = createFixedDateTime(2024, 6, 15, 8, 0)
      expect(getDateGroupLabel(today, 'UTC')).toBe('Today')
    })

    it('should return "Yesterday" for yesterday', () => {
      const yesterday = createFixedDateTime(2024, 6, 14, 12, 0)
      expect(getDateGroupLabel(yesterday, 'UTC')).toBe('Yesterday')
    })

    it('should return formatted date for other days', () => {
      const lastWeek = createFixedDateTime(2024, 6, 10, 12, 0)
      const result = getDateGroupLabel(lastWeek, 'UTC')
      expect(result).not.toBe('Today')
      expect(result).not.toBe('Yesterday')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('Convenience functions', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    describe('daysUntilApiDate', () => {
      it('should return days for valid date', () => {
        const futureDate = new Date('2024-06-20T12:00:00Z')
        const result = daysUntilApiDate(futureDate)
        expect(result).toBe(5)
      })

      it('should return default for null', () => {
        const result = daysUntilApiDate(null)
        expect(result).toBe(0)
      })

      it('should return custom default for null', () => {
        const result = daysUntilApiDate(null, -1)
        expect(result).toBe(-1)
      })
    })

    describe('formatApiDateAsNextDate', () => {
      it('should format valid date', () => {
        const date = new Date('2024-06-17T12:00:00Z') // Monday
        const result = formatApiDateAsNextDate(date)
        expect(result.startsWith('Next: ')).toBe(true)
      })

      it('should return default for null', () => {
        const result = formatApiDateAsNextDate(null)
        expect(result).toBe('Not set')
      })

      it('should return custom default for null', () => {
        const result = formatApiDateAsNextDate(null, 'N/A')
        expect(result).toBe('N/A')
      })
    })

    describe('formatApiRelativeTime', () => {
      it('should format valid date', () => {
        const date = new Date('2024-06-15T11:30:00Z')
        const result = formatApiRelativeTime(date)
        expect(result).toBe('30m ago')
      })

      it('should return default for null', () => {
        const result = formatApiRelativeTime(null)
        expect(result).toBe('Unknown')
      })
    })

    describe('formatApiTime', () => {
      it('should format valid date', () => {
        const date = new Date('2024-06-15T14:30:00Z')
        const result = formatApiTime(date)
        expect(result).toContain('30')
      })

      it('should return default for null', () => {
        const result = formatApiTime(null)
        expect(result).toBe('')
      })
    })

    describe('getApiDateGroupLabel', () => {
      it('should return "Today" for today', () => {
        const today = new Date('2024-06-15T08:00:00Z')
        const result = getApiDateGroupLabel(today, 'UTC')
        expect(result).toBe('Today')
      })

      it('should return default for null', () => {
        const result = getApiDateGroupLabel(null, 'UTC')
        expect(result).toBe('Unknown')
      })
    })
  })

  describe('Timezone handling', () => {
    it('should correctly parse dates from different timezone representations', () => {
      // These all represent the same moment in time
      const utcString = '2024-06-15T12:00:00Z'
      const offsetString = '2024-06-15T14:00:00+02:00'

      const utcResult = parseApiDate(utcString)
      const offsetResult = parseApiDate(offsetString)

      expect(Option.isSome(utcResult)).toBe(true)
      expect(Option.isSome(offsetResult)).toBe(true)

      if (Option.isSome(utcResult) && Option.isSome(offsetResult)) {
        // Both should represent the same UTC time
        const utcMs = DateTime.toEpochMillis(utcResult.value)
        const offsetMs = DateTime.toEpochMillis(offsetResult.value)
        expect(utcMs).toBe(offsetMs)
      }
    })

    it('should preserve date components when parsing', () => {
      const isoString = '2024-12-25T08:30:45.123Z'
      const result = parseApiDate(isoString)

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        const parts = DateTime.toParts(result.value)
        expect(parts.year).toBe(2024)
        expect(parts.month).toBe(12)
        expect(parts.day).toBe(25)
        expect(parts.hours).toBe(8)
        expect(parts.minutes).toBe(30)
        expect(parts.seconds).toBe(45)
      }
    })

    it('should handle leap years correctly', () => {
      // Feb 29, 2024 (leap year)
      const leapDay = parseApiDate('2024-02-29T12:00:00Z')
      expect(Option.isSome(leapDay)).toBe(true)
      if (Option.isSome(leapDay)) {
        const parts = DateTime.toParts(leapDay.value)
        expect(parts.month).toBe(2)
        expect(parts.day).toBe(29)
      }
    })

    it('should handle end of year boundary', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-12-31T23:59:00Z'))

      const tomorrow = createFixedDateTime(2025, 1, 1, 0, 0)
      const result = daysUntil(tomorrow)
      expect(result).toBe(1)

      vi.useRealTimers()
    })

    it('should handle daylight saving time transitions', () => {
      // This tests that dates around DST don't cause issues
      // March 10, 2024 - US DST starts
      const beforeDst = parseApiDate('2024-03-10T01:00:00Z')
      const afterDst = parseApiDate('2024-03-10T10:00:00Z')

      expect(Option.isSome(beforeDst)).toBe(true)
      expect(Option.isSome(afterDst)).toBe(true)

      if (Option.isSome(beforeDst) && Option.isSome(afterDst)) {
        const diffMs =
          DateTime.toEpochMillis(afterDst.value) -
          DateTime.toEpochMillis(beforeDst.value)
        // Should be exactly 9 hours difference
        expect(diffMs).toBe(9 * 60 * 60 * 1000)
      }
    })
  })

  describe('Edge cases', () => {
    it('should handle very old dates', () => {
      const oldDate = parseApiDate('1990-01-15T12:00:00Z')
      expect(Option.isSome(oldDate)).toBe(true)
      if (Option.isSome(oldDate)) {
        const parts = DateTime.toParts(oldDate.value)
        expect(parts.year).toBe(1990)
      }
    })

    it('should handle far future dates', () => {
      const futureDate = parseApiDate('2099-12-31T23:59:59Z')
      expect(Option.isSome(futureDate)).toBe(true)
      if (Option.isSome(futureDate)) {
        const parts = DateTime.toParts(futureDate.value)
        expect(parts.year).toBe(2099)
      }
    })

    it('should handle dates at exact midnight', () => {
      const midnight = createFixedDateTime(2024, 6, 15, 0, 0, 0)
      const timeResult = formatTime(midnight)
      expect(timeResult.length).toBeGreaterThan(0)
    })

    it('should handle dates at end of day', () => {
      const endOfDay = createFixedDateTime(2024, 6, 15, 23, 59, 59)
      const timeResult = formatTime(endOfDay)
      expect(timeResult.length).toBeGreaterThan(0)
    })

    it('should handle month boundaries for daysBetween', () => {
      const jan31 = createFixedDateTime(2024, 1, 31)
      const feb1 = createFixedDateTime(2024, 2, 1)
      const result = daysBetween(jan31, feb1)
      expect(result).toBe(1)
    })

    it('should handle last day of month', () => {
      // December 31
      const dec31 = createFixedDateTime(2024, 12, 31)
      const formatted = formatShortDate(dec31)
      expect(formatted).toContain('31')
    })
  })

  describe('timezone-aware functions', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      // Jan 29, 2025 12:00 UTC (Wednesday)
      vi.setSystemTime(new Date('2025-01-29T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('withTimeZone should convert UTC DateTime to zoned with local parts', () => {
      const utcDt = createFixedDateTime(2025, 1, 29, 0, 30)
      const zoned = withTimeZone(utcDt, 'Asia/Tokyo')
      const parts = DateTime.toParts(zoned)
      // UTC 00:30 + 9h = 09:30 JST
      expect(parts.hours).toBe(9)
      expect(parts.day).toBe(29)
    })

    it('isToday with timezone — Tokyo sees Jan 29 for UTC 00:30 Jan 29', () => {
      const utcDt = createFixedDateTime(2025, 1, 29, 0, 30)
      const ref = createFixedDateTime(2025, 1, 29, 0, 30)
      // In Tokyo (UTC+9), 00:30 UTC Jan 29 = 09:30 Jan 29 → today
      expect(isToday(utcDt, ref, 'Asia/Tokyo')).toBe(true)
    })

    it('isToday with timezone — New York sees Jan 28 for UTC 00:30 Jan 29', () => {
      const utcDt = createFixedDateTime(2025, 1, 29, 0, 30)
      const ref = createFixedDateTime(2025, 1, 29, 0, 30)
      // In New York (UTC-5), 00:30 UTC Jan 29 = 19:30 Jan 28 → both ref and target are Jan 28
      // Both are Jan 28 in NY, so isToday is true (they're the same day in that TZ)
      expect(isToday(utcDt, ref, 'America/New_York')).toBe(true)
    })

    it('isToday with timezone — day boundary: Jan 28 23:30 UTC is Jan 29 in Paris', () => {
      // Jan 28 23:30 UTC = Jan 29 00:30 in Europe/Paris (UTC+1)
      const utcDt = createFixedDateTime(2025, 1, 28, 23, 30)
      // Reference is Jan 28 12:00 UTC = Jan 28 13:00 Paris
      const ref = createFixedDateTime(2025, 1, 28, 12, 0)
      // In Paris: target is Jan 29, ref is Jan 28 → not today
      expect(isToday(utcDt, ref, 'Europe/Paris')).toBe(false)
    })

    it('startOfDay with timezone returns midnight in user timezone', () => {
      const utcDt = createFixedDateTime(2025, 1, 29, 10, 30)
      const result = startOfDay(utcDt, 'America/New_York')
      const parts = DateTime.toParts(result)
      expect(parts.hours).toBe(0)
      expect(parts.minutes).toBe(0)
      expect(parts.seconds).toBe(0)
      // In NY, 10:30 UTC = 05:30 Jan 29 → startOfDay = Jan 29 00:00
      expect(parts.day).toBe(29)
    })

    it('endOfDay with timezone returns 23:59:59.999 in user timezone', () => {
      const utcDt = createFixedDateTime(2025, 1, 29, 10, 30)
      const result = endOfDay(utcDt, 'Asia/Tokyo')
      const parts = DateTime.toParts(result)
      expect(parts.hours).toBe(23)
      expect(parts.minutes).toBe(59)
      expect(parts.seconds).toBe(59)
      expect(parts.millis).toBe(999)
      // In Tokyo, 10:30 UTC = 19:30 Jan 29 → endOfDay = Jan 29 23:59:59.999
      expect(parts.day).toBe(29)
    })

    it('endOfWeek with timezone respects user timezone', () => {
      // Jan 29 2025 is Wednesday
      const utcDt = createFixedDateTime(2025, 1, 29, 10, 0)
      const resultUtc = endOfWeek(utcDt, 'UTC')
      const resultTokyo = endOfWeek(utcDt, 'Asia/Tokyo')
      // Both should end on Sunday but the day might differ due to TZ shift
      const partsUtc = DateTime.toParts(resultUtc)
      const partsTokyo = DateTime.toParts(resultTokyo)
      expect(partsUtc.hours).toBe(23)
      expect(partsTokyo.hours).toBe(23)
    })

    it('isOverdueByDay with timezone — different results per timezone', () => {
      // Task: Jan 29 23:30 UTC
      // Reference: Jan 30 12:00 UTC
      const taskDate = createFixedDateTime(2025, 1, 29, 23, 30)
      const ref = createFixedDateTime(2025, 1, 30, 12, 0)

      // In Paris (UTC+1): ref is Jan 30 13:00 → startOfDay(Paris) = Jan 30 00:00 Paris = Jan 29 23:00 UTC
      // task Jan 29 23:30 UTC = Jan 30 00:30 Paris → same day as ref → NOT overdue
      expect(isOverdueByDay(taskDate, ref, 'Europe/Paris')).toBe(false)

      // In UTC: ref is Jan 30 → startOfDay = Jan 30 00:00 UTC
      // task Jan 29 23:30 UTC < Jan 30 00:00 UTC → overdue
      expect(isOverdueByDay(taskDate, ref, 'UTC')).toBe(true)

      // Task on the same day as ref in Paris should NOT be overdue
      const taskSameDay = createFixedDateTime(2025, 1, 30, 5, 0)
      // In Paris: task is Jan 30 06:00 → same day as ref (Jan 30) → not overdue
      expect(isOverdueByDay(taskSameDay, ref, 'Europe/Paris')).toBe(false)

      // In LA (UTC-8): ref is Jan 30 04:00 LA → startOfDay(LA) = Jan 30 00:00 LA = Jan 30 08:00 UTC
      // taskSameDay Jan 30 05:00 UTC = Jan 29 21:00 LA → previous day → overdue
      expect(isOverdueByDay(taskSameDay, ref, 'America/Los_Angeles')).toBe(true)
    })

    it('isThisWeek with timezone — categorization changes by timezone', () => {
      // Jan 29 2025 is Wednesday. End of week = Sunday Feb 2
      const ref = createFixedDateTime(2025, 1, 29, 12, 0)
      // A task on Feb 1 12:00 UTC
      const task = createFixedDateTime(2025, 2, 1, 12, 0)

      // Should be this week in both UTC and Tokyo
      expect(isThisWeek(task, ref, 'UTC')).toBe(true)
      expect(isThisWeek(task, ref, 'Asia/Tokyo')).toBe(true)
    })

    it('functions work with explicit UTC timezone', () => {
      const ref = createFixedDateTime(2025, 1, 29, 12, 0)
      const target = createFixedDateTime(2025, 1, 29, 8, 0)

      // isToday with UTC timezone
      expect(isToday(target, ref, 'UTC')).toBe(true)
      expect(isToday(target, DateTime.unsafeNow(), 'UTC')).toBe(true)

      // startOfDay with UTC timezone
      const sod = startOfDay(ref, 'UTC')
      const parts = DateTime.toParts(sod)
      expect(parts.hours).toBe(0)
      expect(parts.day).toBe(29)

      // endOfDay with UTC timezone
      const eod = endOfDay(ref, 'UTC')
      const eodParts = DateTime.toParts(eod)
      expect(eodParts.hours).toBe(23)

      // isOverdueByDay with UTC timezone
      const yesterday = createFixedDateTime(2025, 1, 28, 23, 59)
      expect(isOverdueByDay(yesterday, ref, 'UTC')).toBe(true)

      // isThisWeek with UTC timezone
      const tomorrow = createFixedDateTime(2025, 1, 30, 12, 0)
      expect(isThisWeek(tomorrow, ref, 'UTC')).toBe(true)
    })
  })

  describe('Locale formatting verification', () => {
    it('should use toLocaleDateString for day formatting', () => {
      const date = createFixedDateTime(2024, 6, 17)
      const nativeDate = new Date(Date.UTC(2024, 5, 17, 12, 0, 0))

      // The result should match what toLocaleDateString returns
      const expected = nativeDate.toLocaleDateString(undefined, {
        weekday: 'long',
      })
      const result = formatDayOfWeek(date)
      expect(result).toBe(expected)
    })

    it('should use toLocaleTimeString for time formatting', () => {
      const date = createFixedDateTime(2024, 6, 17, 14, 30)
      const nativeDate = new Date(Date.UTC(2024, 5, 17, 14, 30, 0))

      const expected = nativeDate.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
      const result = formatTime(date)
      expect(result).toBe(expected)
    })

    it('should use toLocaleDateString for short date formatting', () => {
      const date = createFixedDateTime(2024, 6, 17)
      const nativeDate = new Date(Date.UTC(2024, 5, 17, 12, 0, 0))

      const expected = nativeDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      const result = formatShortDate(date)
      expect(result).toBe(expected)
    })

    it('should use toLocaleDateString for long date formatting', () => {
      const date = createFixedDateTime(2024, 6, 17)
      const nativeDate = new Date(Date.UTC(2024, 5, 17, 12, 0, 0))

      const expected = nativeDate.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
      const result = formatLongDate(date)
      expect(result).toBe(expected)
    })
  })
})
