import {
  DueWindow,
  duePrune,
  type ScheduledCare,
} from '@lily/api/contexts/care'
import { seeDue } from '@lily/api/contexts/care/care-reads'
import { CareDays } from '@lily/shared'
import { Array, DateTime } from 'effect'
import { describe, expect, it } from 'vitest'

const TIMEZONES = [
  'Pacific/Kiritimati',
  'Pacific/Apia',
  'Pacific/Chatham',
  'Asia/Tokyo',
  'Europe/Paris',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Pacific/Niue',
  'Etc/GMT+12',
]

const WINDOWS = [
  DueWindow.Overdue(),
  DueWindow.DueOrOverdue(),
  DueWindow.Ahead({ days: 7 }),
]

const ORDINARY_DAY = '2026-11-11'
const EUROPE_CLOCKS_GO_FORWARD = '2026-03-29'
const EUROPE_CLOCKS_GO_BACK = '2026-10-25'
const US_CLOCKS_GO_BACK = '2026-11-01'

const HOURS = Array.flatMap(
  [
    ORDINARY_DAY,
    EUROPE_CLOCKS_GO_FORWARD,
    EUROPE_CLOCKS_GO_BACK,
    US_CLOCKS_GO_BACK,
  ],
  (day) =>
    Array.makeBy(24, (hour) =>
      DateTime.add(DateTime.makeUnsafe(`${day}T00:30:00Z`), { hours: hour })
    )
)

const scheduled = (
  timezone: string,
  now: DateTime.DateTime,
  dayOffset: number
): ScheduledCare => {
  const dueDay = CareDays.addDays(CareDays.today(timezone, now), dayOffset)
  return {
    careType: 'watering',
    frequencyDays: 7,
    dueAt: DateTime.toDateUtc(CareDays.startOf(dueDay, timezone)),
    dueDay,
    careTimezone: timezone,
    plant: {
      id: `plant-${dayOffset}`,
      name: 'Fern',
      imageUrl: null,
      owner: { _tag: 'User', userId: 'user-1' },
      remindersEnabled: true,
      dateAdded: new Date('2026-01-01T00:00:00Z'),
      room: null,
      sharedBy: null,
    },
  }
}

describe('duePrune', () => {
  it.each(TIMEZONES)('cuts no care the window admits in %s', (timezone) => {
    const cut = Array.flatMap(HOURS, (now) =>
      Array.flatMap(WINDOWS, (upTo) => {
        const prune = duePrune(upTo, now)
        const candidates = Array.makeBy(14, (i) =>
          scheduled(timezone, now, i - 3)
        )
        return Array.flatMap(seeDue(candidates, upTo, now), (care) =>
          care.dueDay <= prune.day
            ? []
            : [[DateTime.formatIso(now), upTo._tag, care.dueDay, prune.day]]
        )
      })
    )

    expect(cut).toEqual([])
  })

  it('keeps nothing later than the last day the window admits in the timezone furthest ahead', () => {
    const now = DateTime.makeUnsafe('2026-11-11T23:30:00Z')

    expect(duePrune(DueWindow.DueOrOverdue(), now).day).toBe(
      CareDays.today('Pacific/Kiritimati', now)
    )
    expect(duePrune(DueWindow.Ahead({ days: 7 }), now).day).toBe(
      CareDays.addDays(CareDays.today('Pacific/Kiritimati', now), 7)
    )
  })
})

describe('seeDue', () => {
  it('decides the status from the stored due day, not from the instant', () => {
    const now = DateTime.makeUnsafe('2026-11-11T23:30:00Z')
    const care = {
      ...scheduled('Europe/Paris', now, 0),
      careTimezone: 'America/Los_Angeles',
    }

    expect(seeDue([care], DueWindow.Any(), now)).toMatchObject([
      {
        dueDay: '2026-11-12',
        today: '2026-11-11',
        status: { _tag: 'Upcoming', inDays: 1 },
      },
    ])
  })
})
