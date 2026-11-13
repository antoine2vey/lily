import {
  NOT_DUE_YET,
  type ScheduleSpec,
} from '@lily/api/__tests__/fixtures/plants'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { CareDays } from '@lily/shared'
import { DateTime } from 'effect'

export const createTestSchedule = (
  overrides: Partial<CareScheduleRow> = {}
): CareScheduleRow => {
  const nextCareAt = overrides.nextCareAt ?? NOT_DUE_YET
  return {
    id: `schedule-${crypto.randomUUID()}`,
    plantId: 'plant-1',
    careType: 'watering',
    frequencyDays: 7,
    lastCareAt: null,
    dueDay: CareDays.of(DateTime.makeUnsafe(nextCareAt), 'UTC'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    nextCareAt,
  }
}

/**
 * Build schedule rows from plant fixtures.
 * Creates one CareScheduleRow per entry in each plant's scheduleSpecs.
 */
export const schedulesFromPlants = (
  plants: ReadonlyArray<{ id: string; scheduleSpecs: ScheduleSpec[] }>
): CareScheduleRow[] => {
  const schedules: CareScheduleRow[] = []

  for (const p of plants) {
    for (const spec of p.scheduleSpecs) {
      schedules.push(
        createTestSchedule({
          plantId: p.id,
          careType: spec.careType,
          frequencyDays: spec.frequencyDays,
          lastCareAt: spec.lastCareAt,
          nextCareAt: spec.nextCareAt,
          ...(spec.dueDay === undefined ? {} : { dueDay: spec.dueDay }),
        })
      )
    }
  }

  return schedules
}
