import { Array, DateTime, Effect, Option, pipe, Record } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CareDay, CareDays } from '../domains/care/care-day'
import {
  endOfDay,
  endOfWeek,
  localDayKey,
  startOfDay,
  startOfLocalDay,
  startOfTodayAsDate,
  startOfTomorrowAsDate,
  startOfWeek,
  zoneFromName,
} from '../domains/common/date'
import { pickNotificationTime } from '../domains/notification/overdue'
import {
  CANONICAL_TIME_ZONES,
  TIME_ZONE_ALIASES,
} from '../domains/notification/time-zones.generated'

const NOW = '2026-11-16T10:00:00.000Z'
const day = CareDay.make('2026-11-16')
const now = DateTime.makeUnsafe(NOW)

const iso = (dateTime: DateTime.DateTime | Date): string =>
  dateTime instanceof Date
    ? dateTime.toISOString()
    : DateTime.formatIso(DateTime.toUtc(dateTime))

const everyHelper = (timezone: string) => ({
  'CareDays.startOf': iso(CareDays.startOf(day, timezone)),
  startOfDay: iso(startOfDay(now, timezone)),
  endOfDay: iso(endOfDay(now, timezone)),
  startOfWeek: iso(startOfWeek(now, timezone)),
  endOfWeek: iso(endOfWeek(now, timezone)),
  localDayKey: localDayKey(now, timezone),
  startOfTodayAsDate: iso(startOfTodayAsDate(timezone)),
  startOfTomorrowAsDate: iso(startOfTomorrowAsDate(timezone)),
  pickNotificationTime: iso(
    Effect.runSync(pickNotificationTime('user', timezone, false, null, null, 0))
  ),
})

const atUtcOffsetZero = {
  'CareDays.startOf': '2026-11-16T00:00:00.000Z',
  startOfDay: '2026-11-16T00:00:00.000Z',
  endOfDay: '2026-11-16T23:59:59.999Z',
  startOfWeek: '2026-11-16T00:00:00.000Z',
  endOfWeek: '2026-11-22T23:59:59.999Z',
  localDayKey: '2026-11-16',
  startOfTodayAsDate: '2026-11-16T00:00:00.000Z',
  startOfTomorrowAsDate: '2026-11-17T00:00:00.000Z',
  pickNotificationTime: '2026-11-16T06:00:00.000Z',
}

describe('zone names in the date helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(['GMT', 'GMT0', 'UTC', 'Etc/GMT', 'Etc/UTC', 'Eire'])(
    'computes every boundary for %s, which sits at UTC+0 in November',
    (timezone) => {
      expect(everyHelper(timezone)).toEqual(atUtcOffsetZero)
      expect(Option.map(startOfLocalDay(day, timezone), iso)).toEqual(
        Option.some('2026-11-16T00:00:00.000Z')
      )
    }
  )

  it('computes every boundary for the legacy name US/Pacific', () => {
    expect(everyHelper('US/Pacific')).toEqual({
      'CareDays.startOf': '2026-11-16T08:00:00.000Z',
      startOfDay: '2026-11-16T08:00:00.000Z',
      endOfDay: '2026-11-17T07:59:59.999Z',
      startOfWeek: '2026-11-16T08:00:00.000Z',
      endOfWeek: '2026-11-23T07:59:59.999Z',
      localDayKey: '2026-11-16',
      startOfTodayAsDate: '2026-11-16T08:00:00.000Z',
      startOfTomorrowAsDate: '2026-11-17T08:00:00.000Z',
      pickNotificationTime: '2026-11-16T14:00:00.000Z',
    })
  })

  it('reports an unknown zone as None and computes UTC boundaries for it', () => {
    expect(everyHelper('Not/A_Zone')).toEqual(atUtcOffsetZero)
    expect(startOfLocalDay(day, 'Not/A_Zone')).toEqual(Option.none())
    expect(zoneFromName('Not/A_Zone')).toEqual(Option.none())
  })

  it('resolves every zone name tzdata knows to the day it starts', () => {
    const names = [...CANONICAL_TIME_ZONES, ...Record.keys(TIME_ZONE_ALIASES)]
    const mismatched = Array.filter(
      names,
      (timezone) =>
        !pipe(
          startOfLocalDay(day, timezone),
          Option.exists(
            (start) =>
              iso(start) === iso(CareDays.startOf(day, timezone)) &&
              localDayKey(start, timezone) === day
          )
        )
    )
    expect(mismatched).toEqual([])
  })
})
