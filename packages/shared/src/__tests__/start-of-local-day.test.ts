import { Array, DateTime, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { localDayKey, startOfLocalDay } from '../domains/common/date'

const isoOf = (
  dayKey: string,
  timezone: string,
  daysLater?: number
): Option.Option<string> =>
  pipe(
    startOfLocalDay(dayKey, timezone, daysLater),
    Option.map((dt) => DateTime.formatIso(dt))
  )

describe('startOfLocalDay', () => {
  it('returns local midnight as an instant', () => {
    expect(isoOf('2026-01-15', 'UTC')).toEqual(
      Option.some('2026-01-15T00:00:00.000Z')
    )
    expect(isoOf('2026-01-15', 'Europe/Paris')).toEqual(
      Option.some('2026-01-14T23:00:00.000Z')
    )
    expect(isoOf('2026-01-15', 'America/New_York')).toEqual(
      Option.some('2026-01-15T05:00:00.000Z')
    )
  })

  it('lands on the next local midnight across a 23h spring-forward day', () => {
    expect(isoOf('2026-03-29', 'Europe/Paris')).toEqual(
      Option.some('2026-03-28T23:00:00.000Z')
    )
    expect(isoOf('2026-03-29', 'Europe/Paris', 1)).toEqual(
      Option.some('2026-03-29T22:00:00.000Z')
    )
  })

  it('lands on the next local midnight across a 25h fall-back day', () => {
    expect(isoOf('2026-11-01', 'America/New_York')).toEqual(
      Option.some('2026-11-01T04:00:00.000Z')
    )
    expect(isoOf('2026-11-01', 'America/New_York', 1)).toEqual(
      Option.some('2026-11-02T05:00:00.000Z')
    )
  })

  it('rolls daysLater over month and year ends', () => {
    expect(isoOf('2026-12-31', 'UTC', 1)).toEqual(
      Option.some('2027-01-01T00:00:00.000Z')
    )
    expect(isoOf('2026-02-28', 'UTC', 1)).toEqual(
      Option.some('2026-03-01T00:00:00.000Z')
    )
  })

  it('is the inverse of localDayKey for every day of a DST-crossing week', () => {
    const keys = [
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
    ]
    const roundTripped = Array.map(keys, (key) =>
      pipe(
        startOfLocalDay(key, 'Europe/Paris'),
        Option.map((dt) => localDayKey(dt, 'Europe/Paris'))
      )
    )
    expect(roundTripped).toEqual(Array.map(keys, Option.some))
  })

  it('rejects keys that are not real calendar dates', () => {
    expect(startOfLocalDay('2026-02-30', 'UTC')).toEqual(Option.none())
    expect(startOfLocalDay('2026-1-5', 'UTC')).toEqual(Option.none())
    expect(startOfLocalDay('not-a-day', 'UTC')).toEqual(Option.none())
  })

  it('rejects unknown timezones', () => {
    expect(startOfLocalDay('2026-01-15', 'Mars/Olympus_Mons')).toEqual(
      Option.none()
    )
  })
})
