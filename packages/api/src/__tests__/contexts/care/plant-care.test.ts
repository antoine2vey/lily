import { type StoredSchedule, seePlantCare } from '@lily/api/contexts/care'
import type { PlantHealthStatus } from '@lily/shared'
import { DateTime } from 'effect'
import { describe, expect, it } from 'vitest'

// 23:30 UTC on Nov 11: already Nov 12 in Paris, still Nov 11 in Los Angeles.
const now = DateTime.makeUnsafe('2026-11-11T23:30:00Z')

const watering = (nextCareAt: string | null): StoredSchedule => ({
  careType: 'watering',
  frequencyDays: 7,
  lastCareAt: null,
  nextCareAt: nextCareAt === null ? null : new Date(nextCareAt),
})

const living = (health: PlantHealthStatus) => ({ health, diedAt: null })

// Paris midnight of Nov 11, as the care paths store a due day.
const dueNov11InParis = watering('2026-11-10T23:00:00Z')

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
      [watering('2026-11-11T08:00:00Z')],
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

  it('leaves an unscheduled care without a due day or status', () => {
    const care = seePlantCare(living('HEALTHY'), [watering(null)], 'UTC', now)

    expect(care.schedules).toMatchObject([{ dueDay: null, status: null }])
    expect(care.health).toBe('HEALTHY')
  })

  it('needs attention exactly while a care is overdue', () => {
    const health = (schedule: StoredSchedule) =>
      seePlantCare(living('THRIVING'), [schedule], 'Europe/Paris', now).health

    expect(health(dueNov11InParis)).toBe('NEEDS_ATTENTION')
    // Due today (Nov 12 in Paris) is not overdue.
    expect(health(watering('2026-11-11T23:00:00Z'))).toBe('THRIVING')
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
