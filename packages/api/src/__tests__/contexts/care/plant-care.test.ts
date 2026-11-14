import {
  type PlantCondition,
  type StoredSchedule,
  seePlantCare,
} from '@lily/api/contexts/care'
import { CareDay } from '@lily/shared'
import { DateTime } from 'effect'
import { describe, expect, it } from 'vitest'

// 23:30 UTC on Nov 11: already Nov 12 in Paris, still Nov 11 in Los Angeles.
const now = DateTime.makeUnsafe('2026-11-11T23:30:00Z')

const watering = (nextCareAt: string, dueDay: string): StoredSchedule => ({
  careType: 'watering',
  frequencyDays: 7,
  lastCareAt: null,
  nextCareAt: new Date(nextCareAt),
  dueDay: CareDay.make(dueDay),
})

const living = (health: PlantCondition) => ({ health, diedAt: null })

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
    const health = (stored: PlantCondition) =>
      seePlantCare(living(stored), [dueNov11InParis], 'Europe/Paris', now)
        .health

    expect(health('SICK')).toBe('SICK')
    expect(health('RECOVERING')).toBe('RECOVERING')
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
