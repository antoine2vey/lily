import { DateTime, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { CareDay, CareDays } from '../domains/care/care-day'
import { careStatus } from '../domains/care/status'

const day = (value: string) => CareDay.make(value)
const at = (iso: string) => DateTime.makeUnsafe(iso)

describe('CareDays.of', () => {
  it.each([
    ['2026-11-11T23:30:00Z', 'Europe/Paris', '2026-11-12'],
    ['2026-11-11T23:30:00Z', 'UTC', '2026-11-11'],
    ['2026-11-12T03:00:00Z', 'America/Los_Angeles', '2026-11-11'],
    ['2026-11-11T11:00:00Z', 'Pacific/Kiritimati', '2026-11-12'],
  ])('%s in %s is %s', (instant, timezone, expected) => {
    expect(CareDays.of(at(instant), timezone)).toBe(expected)
  })
})

describe('CareDays.startOf', () => {
  it.each([
    ['2026-11-12', 'Europe/Paris', '2026-11-11T23:00:00.000Z'],
    ['2026-11-12', 'UTC', '2026-11-12T00:00:00.000Z'],
    ['2026-11-11', 'America/Los_Angeles', '2026-11-11T08:00:00.000Z'],
    ['2026-03-29', 'Europe/Paris', '2026-03-28T23:00:00.000Z'],
    ['2026-03-30', 'Europe/Paris', '2026-03-29T22:00:00.000Z'],
  ])('%s in %s starts at %s', (value, timezone, expected) => {
    const start = CareDays.startOf(day(value), timezone)
    expect(DateTime.formatIso(start)).toBe(expected)
    expect(CareDays.of(start, timezone)).toBe(value)
  })
})

describe('CareDays.latest', () => {
  it('orders days across a month boundary', () => {
    expect(CareDays.latest(day('2026-10-31'), day('2026-11-01'))).toBe(
      '2026-11-01'
    )
    expect(CareDays.isBefore(day('2026-10-31'), day('2026-11-01'))).toBe(true)
  })
})

describe('CareDays.addDays', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-28', 7, '2026-04-04'],
    ['2026-03-01', -1, '2026-02-28'],
  ])('%s + %i days is %s', (from, days, expected) => {
    expect(CareDays.addDays(day(from), days)).toBe(expected)
  })
})

describe('CareDays.daysBetween', () => {
  it('counts calendar days across a daylight-saving change', () => {
    expect(CareDays.daysBetween(day('2026-03-28'), day('2026-03-30'))).toBe(2)
    expect(CareDays.daysBetween(day('2026-10-24'), day('2026-10-26'))).toBe(2)
  })

  it('is negative when the target is earlier', () => {
    expect(CareDays.daysBetween(day('2026-11-12'), day('2026-11-09'))).toBe(-3)
  })
})

describe('CareDay', () => {
  it('rejects a value that is not YYYY-MM-DD', () => {
    expect(() => Schema.decodeSync(CareDay)('2026-11-12T00:00:00Z')).toThrow()
  })
})

describe('careStatus', () => {
  const today = day('2026-11-12')

  it('is due today on the due day', () => {
    expect(careStatus(day('2026-11-12'), today)).toEqual({ _tag: 'DueToday' })
  })

  it('is overdue from the day after the due day', () => {
    expect(careStatus(day('2026-11-11'), today)).toEqual({
      _tag: 'Overdue',
      daysLate: 1,
    })
  })

  it('is upcoming before the due day', () => {
    expect(careStatus(day('2026-11-15'), today)).toEqual({
      _tag: 'Upcoming',
      inDays: 3,
    })
  })

  it('uses the care context day, not the instant', () => {
    const now = at('2026-11-11T23:30:00Z')
    const due = day('2026-11-11')
    expect(careStatus(due, CareDays.today('Europe/Paris', now))._tag).toBe(
      'Overdue'
    )
    expect(careStatus(due, CareDays.today('UTC', now))._tag).toBe('DueToday')
  })
})
