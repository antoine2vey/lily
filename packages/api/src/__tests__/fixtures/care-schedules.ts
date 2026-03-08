import type { ScheduleSpec } from '@lily/api/__tests__/fixtures/plants'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'

export const createTestSchedule = (
  overrides: Partial<CareScheduleRow> = {}
): CareScheduleRow => ({
  id: `schedule-${crypto.randomUUID()}`,
  plantId: 'plant-1',
  careType: 'watering',
  frequencyDays: 7,
  lastCareAt: null,
  nextCareAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

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
        })
      )
    }
  }

  return schedules
}
