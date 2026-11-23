import { DateTime, Option } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CareDay, CareDays } from '../domains/care/care-day'
import { startOfLocalDay } from '../domains/common/date'
import { ZoneName } from '../domains/common/date/zone-name'
import { TIME_ZONE_ALIASES } from '../domains/notification/time-zones.generated'

const RealDateTimeFormat = Intl.DateTimeFormat

// Hermes on iOS accepts only NSTimeZone.knownTimeZoneNames, which lacks these.
const appleLacks = (zone: string): boolean =>
  zone === 'Asia/Kolkata' || zone.startsWith('Etc/GMT')

// Stale tzdata knows the zone by its old name, Europe/Kiev, alone.
const knownKyivIsKiev = (zone: string): boolean =>
  zone !== 'Europe/Kiev' &&
  (zone === 'Europe/Kyiv' || TIME_ZONE_ALIASES[zone] === 'Europe/Kyiv')

const knowOnly = (unknown: (zone: string) => boolean) => {
  // A declaration, because Effect constructs it with new.
  function DateTimeFormat(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ) {
    const zone = options?.timeZone
    if (zone !== undefined && unknown(zone)) {
      throw new RangeError(`Invalid time zone specified: ${zone}`)
    }
    return new RealDateTimeFormat(locales, options)
  }
  return vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(DateTimeFormat)
}

const day = CareDay.make('2026-11-16')
const iso = (dateTime: DateTime.DateTime) =>
  DateTime.formatIso(DateTime.toUtc(dateTime))

describe('a zone the runtime Intl does not know by its canonical name', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-16T10:00:00.000Z'))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([
    ['Asia/Kolkata', appleLacks, '2026-11-15T18:30:00.000Z'],
    ['Etc/GMT-5', appleLacks, '2026-11-15T19:00:00.000Z'],
    ['Etc/GMT+3', appleLacks, '2026-11-16T03:00:00.000Z'],
    ['Europe/Kyiv', knownKyivIsKiev, '2026-11-15T22:00:00.000Z'],
  ])('starts %s days where the zone does', (name, unknown, start) => {
    knowOnly(unknown)
    const zone = ZoneName.make(name)

    expect(iso(CareDays.startOf(day, zone))).toBe(start)
    expect(Option.map(startOfLocalDay(day, zone), iso)).toEqual(
      Option.some(start)
    )
    expect(CareDays.today(zone, DateTime.makeUnsafe(start))).toBe(day)
  })
})
