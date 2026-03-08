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
 * Creates watering schedule for every plant, fertilization schedule
 * only when fertilizationFrequencyDays is set.
 */
export const schedulesFromPlants = (
  plants: ReadonlyArray<{
    id: string
    wateringFrequencyDays: number
    lastWateredAt: Date | null
    nextWateringAt: Date | null
    fertilizationFrequencyDays: number | null
    lastFertilizedAt: Date | null
    nextFertilizationAt: Date | null
  }>
): CareScheduleRow[] => {
  const schedules: CareScheduleRow[] = []

  for (const p of plants) {
    schedules.push(
      createTestSchedule({
        plantId: p.id,
        careType: 'watering',
        frequencyDays: p.wateringFrequencyDays,
        lastCareAt: p.lastWateredAt,
        nextCareAt: p.nextWateringAt,
      })
    )

    if (p.fertilizationFrequencyDays !== null) {
      schedules.push(
        createTestSchedule({
          plantId: p.id,
          careType: 'fertilization',
          frequencyDays: p.fertilizationFrequencyDays,
          lastCareAt: p.lastFertilizedAt,
          nextCareAt: p.nextFertilizationAt,
        })
      )
    }
  }

  return schedules
}
