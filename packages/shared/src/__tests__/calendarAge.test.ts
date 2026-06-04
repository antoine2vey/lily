import { DateTime, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { getCalendarAge } from '../domains/common/date'

/** Build a UTC DateTime from an ISO string for deterministic assertions. */
const dt = (iso: string): DateTime.DateTime =>
  Option.getOrThrow(DateTime.make(iso))

describe('getCalendarAge', () => {
  it('returns all zeros for the same instant', () => {
    expect(
      getCalendarAge(dt('2025-06-20T10:00:00Z'), dt('2025-06-20T10:00:00Z'))
    ).toEqual({ years: 0, months: 0, days: 0 })
  })

  it('counts plain days within a month', () => {
    expect(
      getCalendarAge(dt('2025-06-20T00:00:00Z'), dt('2025-06-22T00:00:00Z'))
    ).toEqual({ years: 0, months: 0, days: 2 })
  })

  it('reports "1 month and 2 days"', () => {
    expect(
      getCalendarAge(dt('2025-05-20T00:00:00Z'), dt('2025-06-22T00:00:00Z'))
    ).toEqual({ years: 0, months: 1, days: 2 })
  })

  it('borrows the correct number of days across a month boundary', () => {
    // Jan 15 → Mar 10: 1 month, then Feb 15 → Mar 10 = 23 days (Feb 2025 = 28d)
    expect(
      getCalendarAge(dt('2025-01-15T00:00:00Z'), dt('2025-03-10T00:00:00Z'))
    ).toEqual({ years: 0, months: 1, days: 23 })
  })

  it('borrows February as 29 days in a leap year', () => {
    expect(
      getCalendarAge(dt('2024-01-30T00:00:00Z'), dt('2024-03-01T00:00:00Z'))
    ).toEqual({ years: 0, months: 1, days: 0 })
  })

  it('handles a year-boundary borrow', () => {
    expect(
      getCalendarAge(dt('2024-12-20T00:00:00Z'), dt('2025-01-10T00:00:00Z'))
    ).toEqual({ years: 0, months: 0, days: 21 })
  })

  it('reports whole years, months and days together', () => {
    expect(
      getCalendarAge(dt('2023-01-10T00:00:00Z'), dt('2025-03-12T00:00:00Z'))
    ).toEqual({ years: 2, months: 2, days: 2 })
  })

  it('clamps to zero when "to" precedes "from"', () => {
    expect(
      getCalendarAge(dt('2025-06-20T00:00:00Z'), dt('2025-06-10T00:00:00Z'))
    ).toEqual({ years: 0, months: 0, days: 0 })
  })
})
