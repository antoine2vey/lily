import { type StoredSchedule, seePlantCare } from '@lily/api/contexts/care'
import type { PlantHealthStatus } from '@lily/shared'
import { DateTime } from 'effect'
import { describe, expect, it } from 'vitest'

// 23:30 UTC on Nov 11: already Nov 12 in Paris, still Nov 11 in Los Angeles.
const now = DateTime.makeUnsafe('2026-11-11T23:30:00Z')

const watering = (
  nextCareAt: string,
  dueDay: string | null
): StoredSchedule => ({
  careType: 'watering',
  frequencyDays: 7,
  lastCareAt: null,
  nextCareAt: new Date(nextCareAt),
  dueDay,
})

const living = (health: PlantHealthStatus) => ({ health, diedAt: null })

const dueNov11InParis = watering('2026-11-10T23:00:00Z', '2026-11-11')

describe('seePlantCare', () => {
  it('decides the status on the care timezone, not on UTC', () => {
    const paris = seePlantCare(
      living('HEALTHY'),
      [dueNov11InParis],
      'Europe/Paris',
      now
    )
    const losAngeles = seePlantCare(
      living('HEALTHY'),
      [watering('2026-11-11T08:00:00Z', '2026-11-11')],
      'America/Los_Angeles',
      now
    )

    expect(paris.today).toBe('2026-11-12')
    expect(paris.schedules).toMatchObject([
      { dueDay: '2026-11-11', status: { _tag: 'Overdue', daysLate: 1 } },
    ])
    expect(losAngeles.today).toBe('2026-11-11')
    expect(losAngeles.schedules).toMatchObject([
      { dueDay: '2026-11-11', status: { _tag: 'DueToday' } },
    ])
  })

  it.each([
    ['Europe/Paris', '2026-11-10T23:00:00Z', '2026-11-11'],
    ['Europe/Paris', '2026-11-11T23:00:00Z', '2026-11-12'],
    ['Europe/Paris', '2026-11-14T23:00:00Z', '2026-11-15'],
    ['America/Los_Angeles', '2026-11-11T08:00:00Z', '2026-11-11'],
    ['Pacific/Kiritimati', '2026-11-11T10:00:00Z', '2026-11-12'],
    ['UTC', '2026-11-09T00:00:00Z', '2026-11-09'],
  ])(
    'answers the same in %s for the stored day of %s as for the day of the instant',
    (timezone, instant, day) => {
      const stored = seePlantCare(
        living('HEALTHY'),
        [watering(instant, day)],
        timezone,
        now
      )
      const derived = seePlantCare(
        living('HEALTHY'),
        [watering(instant, null)],
        timezone,
        now
      )

      expect(stored.schedules).toMatchObject([{ dueDay: day }])
      expect(stored).toEqual(derived)
    }
  )

  it('gives a row without a stored due day the day of its instant in the care timezone', () => {
    const care = seePlantCare(
      living('HEALTHY'),
      [watering('2026-11-10T23:00:00Z', null)],
      'Europe/Paris',
      now
    )

    expect(care.schedules).toMatchObject([
      { dueDay: '2026-11-11', status: { _tag: 'Overdue', daysLate: 1 } },
    ])
    expect(care.health).toBe('NEEDS_ATTENTION')
  })

  it('keeps the stored due day after the care timezone changes (declared change: it is no longer re-derived from the instant)', () => {
    const movedToLosAngeles = seePlantCare(
      living('HEALTHY'),
      [dueNov11InParis],
      'America/Los_Angeles',
      now
    )

    expect(movedToLosAngeles.today).toBe('2026-11-11')
    expect(movedToLosAngeles.schedules).toMatchObject([
      { dueDay: '2026-11-11', status: { _tag: 'DueToday' } },
    ])
    expect(movedToLosAngeles.health).toBe('HEALTHY')
  })

  it('needs attention exactly while a care is overdue', () => {
    const health = (schedule: StoredSchedule) =>
      seePlantCare(living('THRIVING'), [schedule], 'Europe/Paris', now).health

    expect(health(dueNov11InParis)).toBe('NEEDS_ATTENTION')
    // Due today (Nov 12 in Paris) is not overdue.
    expect(health(watering('2026-11-11T23:00:00Z', '2026-11-12'))).toBe(
      'THRIVING'
    )
  })

  it('keeps a sick or recovering condition over an overdue care', () => {
    const health = (stored: PlantHealthStatus) =>
      seePlantCare(living(stored), [dueNov11InParis], 'Europe/Paris', now)
        .health

    expect(health('SICK')).toBe('SICK')
    expect(health('RECOVERING')).toBe('RECOVERING')
  })

  it('reads a stored needs-attention as healthy once nothing is overdue', () => {
    const care = seePlantCare(living('NEEDS_ATTENTION'), [], 'UTC', now)

    expect(care.health).toBe('HEALTHY')
  })

  it('never says a dead plant needs attention', () => {
    const care = seePlantCare(
      { health: 'HEALTHY', diedAt: new Date('2026-11-01T00:00:00Z') },
      [dueNov11InParis],
      'Europe/Paris',
      now
    )

    expect(care.health).toBe('HEALTHY')
  })
})
