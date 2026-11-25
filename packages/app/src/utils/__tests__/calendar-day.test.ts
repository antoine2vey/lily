import { ZoneName } from '@lily/shared'
import { DateTime } from 'effect'
import { tomorrowId } from '@/utils/calendar-day'

describe('tomorrowId', () => {
  it.each([
    ['2026-11-12T10:00:00Z', '2026-11-13'],
    ['2026-10-24T22:30:00Z', '2026-10-26'],
    ['2026-03-28T22:30:00Z', '2026-03-29'],
  ])('at %s in Paris is %s', (instant, expected) => {
    expect(
      tomorrowId(ZoneName.make('Europe/Paris'), DateTime.makeUnsafe(instant))
    ).toBe(expected)
  })
})
