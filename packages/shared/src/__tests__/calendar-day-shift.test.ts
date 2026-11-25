import { Array, DateTime } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDateGroupLabel,
  isYesterday,
  startOfTodayAsDate,
  startOfTomorrowAsDate,
} from '../domains/common/date'
import { ZoneName } from '../domains/common/date/zone-name'

const at = (iso: string) => DateTime.makeUnsafe(iso)

describe('the day after and the day before, one calendar day from now', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    {
      timezone: ZoneName.make('Europe/Paris'),
      clock: '00:30 on the 25-hour day',
      now: '2026-10-24T22:30:00.000Z',
      today: '2026-10-24T22:00:00.000Z',
      tomorrow: '2026-10-25T23:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Europe/Paris'),
      clock: '23:30 on the 25-hour day',
      now: '2026-10-25T22:30:00.000Z',
      today: '2026-10-24T22:00:00.000Z',
      tomorrow: '2026-10-25T23:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Europe/Paris'),
      clock: '23:30 on the eve of the 23-hour day',
      now: '2026-03-28T22:30:00.000Z',
      today: '2026-03-27T23:00:00.000Z',
      tomorrow: '2026-03-28T23:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Europe/Paris'),
      clock: '00:30 on the 23-hour day',
      now: '2026-03-28T23:30:00.000Z',
      today: '2026-03-28T23:00:00.000Z',
      tomorrow: '2026-03-29T22:00:00.000Z',
    },
    {
      timezone: ZoneName.make('America/New_York'),
      clock: '00:30 on the 25-hour day',
      now: '2026-11-01T04:30:00.000Z',
      today: '2026-11-01T04:00:00.000Z',
      tomorrow: '2026-11-02T05:00:00.000Z',
    },
    {
      timezone: ZoneName.make('America/New_York'),
      clock: '23:30 on the eve of the 23-hour day',
      now: '2026-03-08T04:30:00.000Z',
      today: '2026-03-07T05:00:00.000Z',
      tomorrow: '2026-03-08T05:00:00.000Z',
    },
    {
      timezone: ZoneName.make('America/New_York'),
      clock: '23:30 on the 23-hour day',
      now: '2026-03-09T03:30:00.000Z',
      today: '2026-03-08T05:00:00.000Z',
      tomorrow: '2026-03-09T04:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Auckland'),
      clock: '00:30 on the 25-hour day',
      now: '2026-04-04T11:30:00.000Z',
      today: '2026-04-04T11:00:00.000Z',
      tomorrow: '2026-04-05T12:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Auckland'),
      clock: '23:30 on the eve of the 23-hour day',
      now: '2026-09-26T11:30:00.000Z',
      today: '2026-09-25T12:00:00.000Z',
      tomorrow: '2026-09-26T12:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Africa/Cairo'),
      clock: 'noon on the eve of a day whose midnight is skipped',
      now: '2026-04-23T10:00:00.000Z',
      today: '2026-04-22T22:00:00.000Z',
      tomorrow: '2026-04-23T22:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Kiritimati'),
      clock: 'the last millisecond before local midnight',
      now: '2026-06-16T09:59:59.999Z',
      today: '2026-06-15T10:00:00.000Z',
      tomorrow: '2026-06-16T10:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Kiritimati'),
      clock: 'local midnight',
      now: '2026-06-16T10:00:00.000Z',
      today: '2026-06-16T10:00:00.000Z',
      tomorrow: '2026-06-17T10:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Kiritimati'),
      clock: 'the last millisecond before UTC midnight',
      now: '2026-06-15T23:59:59.999Z',
      today: '2026-06-15T10:00:00.000Z',
      tomorrow: '2026-06-16T10:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Kiritimati'),
      clock: 'UTC midnight',
      now: '2026-06-16T00:00:00.000Z',
      today: '2026-06-15T10:00:00.000Z',
      tomorrow: '2026-06-16T10:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Pago_Pago'),
      clock: 'the last millisecond before local midnight',
      now: '2026-06-16T10:59:59.999Z',
      today: '2026-06-15T11:00:00.000Z',
      tomorrow: '2026-06-16T11:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Pago_Pago'),
      clock: 'local midnight',
      now: '2026-06-16T11:00:00.000Z',
      today: '2026-06-16T11:00:00.000Z',
      tomorrow: '2026-06-17T11:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Pago_Pago'),
      clock: 'the last millisecond before UTC midnight',
      now: '2026-06-15T23:59:59.999Z',
      today: '2026-06-15T11:00:00.000Z',
      tomorrow: '2026-06-16T11:00:00.000Z',
    },
    {
      timezone: ZoneName.make('Pacific/Pago_Pago'),
      clock: 'UTC midnight',
      now: '2026-06-16T00:00:00.000Z',
      today: '2026-06-15T11:00:00.000Z',
      tomorrow: '2026-06-16T11:00:00.000Z',
    },
  ])(
    'today runs from one local midnight to the next in $timezone at $clock',
    ({ timezone, now, today, tomorrow }) => {
      vi.setSystemTime(new Date(now))

      expect({
        today: startOfTodayAsDate(timezone).toISOString(),
        tomorrow: startOfTomorrowAsDate(timezone).toISOString(),
      }).toEqual({ today, tomorrow })
    }
  )

  it.each([
    {
      timezone: ZoneName.make('Europe/Paris'),
      clock: '23:30 on the 25-hour day',
      now: '2026-10-25T22:30:00.000Z',
      yesterday: ['2026-10-23T22:00:00.000Z', '2026-10-24T21:59:59.999Z'],
      otherDays: ['2026-10-23T21:59:59.999Z', '2026-10-24T22:00:00.000Z'],
    },
    {
      timezone: ZoneName.make('Europe/Paris'),
      clock: '00:30 on the day after the 23-hour day',
      now: '2026-03-29T22:30:00.000Z',
      yesterday: ['2026-03-28T23:00:00.000Z', '2026-03-29T21:59:59.999Z'],
      otherDays: ['2026-03-28T22:59:59.999Z', '2026-03-29T22:00:00.000Z'],
    },
    {
      timezone: ZoneName.make('America/New_York'),
      clock: '23:30 on the 25-hour day',
      now: '2026-11-02T04:30:00.000Z',
      yesterday: ['2026-10-31T04:00:00.000Z', '2026-11-01T03:59:59.999Z'],
      otherDays: ['2026-10-31T03:59:59.999Z', '2026-11-01T04:00:00.000Z'],
    },
    {
      timezone: ZoneName.make('America/New_York'),
      clock: '00:30 on the day after the 23-hour day',
      now: '2026-03-09T04:30:00.000Z',
      yesterday: ['2026-03-08T05:00:00.000Z', '2026-03-09T03:59:59.999Z'],
      otherDays: ['2026-03-08T04:59:59.999Z', '2026-03-09T04:00:00.000Z'],
    },
    {
      timezone: ZoneName.make('Pacific/Auckland'),
      clock: '23:30 on the 25-hour day',
      now: '2026-04-05T11:30:00.000Z',
      yesterday: ['2026-04-03T11:00:00.000Z', '2026-04-04T10:59:59.999Z'],
      otherDays: ['2026-04-03T10:59:59.999Z', '2026-04-04T11:00:00.000Z'],
    },
    {
      timezone: ZoneName.make('Pacific/Auckland'),
      clock: '00:30 on the day after the 23-hour day',
      now: '2026-09-27T11:30:00.000Z',
      yesterday: ['2026-09-26T12:00:00.000Z', '2026-09-27T10:59:59.999Z'],
      otherDays: ['2026-09-26T11:59:59.999Z', '2026-09-27T11:00:00.000Z'],
    },
    {
      timezone: ZoneName.make('Pacific/Kiritimati'),
      clock: 'local midnight',
      now: '2026-06-16T10:00:00.000Z',
      yesterday: ['2026-06-15T10:00:00.000Z', '2026-06-16T09:59:59.999Z'],
      otherDays: ['2026-06-15T09:59:59.999Z', '2026-06-16T10:00:00.000Z'],
    },
    {
      timezone: ZoneName.make('Pacific/Kiritimati'),
      clock: 'UTC midnight',
      now: '2026-06-16T00:00:00.000Z',
      yesterday: ['2026-06-14T10:00:00.000Z', '2026-06-15T09:59:59.999Z'],
      otherDays: ['2026-06-14T09:59:59.999Z', '2026-06-15T23:59:59.999Z'],
    },
    {
      timezone: ZoneName.make('Pacific/Pago_Pago'),
      clock: 'local midnight',
      now: '2026-06-16T11:00:00.000Z',
      yesterday: ['2026-06-15T11:00:00.000Z', '2026-06-16T10:59:59.999Z'],
      otherDays: ['2026-06-15T10:59:59.999Z', '2026-06-16T11:00:00.000Z'],
    },
    {
      timezone: ZoneName.make('Pacific/Pago_Pago'),
      clock: 'the last millisecond before UTC midnight',
      now: '2026-06-15T23:59:59.999Z',
      yesterday: ['2026-06-14T11:00:00.000Z', '2026-06-15T10:59:59.999Z'],
      otherDays: ['2026-06-14T10:59:59.999Z', '2026-06-15T11:00:00.000Z'],
    },
  ])(
    'yesterday is the local day before today in $timezone at $clock',
    ({ timezone, now, yesterday, otherDays }) => {
      vi.setSystemTime(new Date(now))

      expect({
        yesterday: Array.map(yesterday, (iso) =>
          isYesterday(at(iso), timezone)
        ),
        otherDays: Array.map(otherDays, (iso) =>
          isYesterday(at(iso), timezone)
        ),
      }).toEqual({ yesterday: [true, true], otherDays: [false, false] })
    }
  )

  it('labels noon of the day before a 25-hour day as Yesterday', () => {
    vi.setSystemTime(new Date('2026-10-25T22:30:00.000Z'))

    expect(
      getDateGroupLabel(at('2026-10-24T10:00:00.000Z'), 'Europe/Paris')
    ).toBe('Yesterday')
  })
})
