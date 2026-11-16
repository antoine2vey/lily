import { DateTime } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  endOfDay,
  endOfWeek,
  isThisWeek,
  isUpcoming,
} from '../domains/common/date'

const at = (iso: string) => DateTime.makeUnsafe(iso)
const iso = (dateTime: DateTime.DateTime) =>
  DateTime.formatIso(DateTime.toUtc(dateTime))

describe('end of a local day whose last hour repeats or is skipped', () => {
  it.each([
    {
      timezone: 'Africa/Cairo',
      noon: '2026-10-29T12:00:00.000Z',
      clock: '23:00 to 23:59 happens twice',
      lastMillisecond: '2026-10-29T21:59:59.999Z',
    },
    {
      timezone: 'America/Nuuk',
      noon: '2026-03-28T12:00:00.000Z',
      clock: '23:00 to 23:59 is skipped',
      lastMillisecond: '2026-03-29T00:59:59.999Z',
    },
    {
      timezone: 'America/Nuuk',
      noon: '2026-10-24T12:00:00.000Z',
      clock: '23:00 to 23:59 happens twice',
      lastMillisecond: '2026-10-25T01:59:59.999Z',
    },
    {
      timezone: 'America/Santiago',
      noon: '2026-04-04T12:00:00.000Z',
      clock: '23:00 to 23:59 happens twice',
      lastMillisecond: '2026-04-05T03:59:59.999Z',
    },
  ])(
    'endOfDay in $timezone at $noon, where $clock',
    ({ timezone, noon, lastMillisecond }) => {
      expect(iso(endOfDay(at(noon), timezone))).toBe(lastMillisecond)
    }
  )

  it('endOfWeek ends a Sunday whose last hour happens twice', () => {
    expect(
      iso(endOfWeek(at('2008-08-27T12:00:00.000Z'), 'Africa/Casablanca'))
    ).toBe('2008-08-31T23:59:59.999Z')
  })

  it('keeps the second pass through 23:30 in today', () => {
    const noon = at('2026-10-29T12:00:00.000Z')
    const secondPass = at('2026-10-29T21:30:00.000Z')

    expect(isUpcoming(secondPass, noon, 'Africa/Cairo')).toBe(false)
    expect(isThisWeek(secondPass, noon, 'Africa/Cairo')).toBe(false)
  })

  it('puts the instant after a skipped last hour in tomorrow', () => {
    const noon = at('2026-03-28T12:00:00.000Z')
    const nextMidnight = at('2026-03-29T01:00:00.000Z')

    expect(isUpcoming(nextMidnight, noon, 'America/Nuuk')).toBe(true)
    expect(isThisWeek(nextMidnight, noon, 'America/Nuuk')).toBe(true)
  })
})
