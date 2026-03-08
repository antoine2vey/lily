import { Array, Option, pipe } from 'effect'
import type { PlantCareSchedule } from './schema'

export const getScheduleByType = (
  schedules: readonly PlantCareSchedule[],
  careType: 'watering' | 'fertilization'
): Option.Option<PlantCareSchedule> =>
  Array.findFirst(schedules, (s) => s.careType === careType)

export const getWateringSchedule = (
  schedules: readonly PlantCareSchedule[]
): Option.Option<PlantCareSchedule> => getScheduleByType(schedules, 'watering')

export const getFertilizationSchedule = (
  schedules: readonly PlantCareSchedule[]
): Option.Option<PlantCareSchedule> =>
  getScheduleByType(schedules, 'fertilization')

// Convenience accessors — return nullable values directly,
// avoiding repeated Option.match boilerplate in screens.

const getScheduleField = <K extends keyof PlantCareSchedule>(
  schedules: readonly PlantCareSchedule[],
  careType: 'watering' | 'fertilization',
  field: K
): PlantCareSchedule[K] | null =>
  pipe(
    getScheduleByType(schedules, careType),
    Option.map((s) => s[field]),
    Option.getOrNull
  )

export const getNextCareAt = (
  schedules: readonly PlantCareSchedule[],
  careType: 'watering' | 'fertilization'
): Date | null => getScheduleField(schedules, careType, 'nextCareAt')

export const getLastCareAt = (
  schedules: readonly PlantCareSchedule[],
  careType: 'watering' | 'fertilization'
): Date | null => getScheduleField(schedules, careType, 'lastCareAt')

export const getFrequencyDays = (
  schedules: readonly PlantCareSchedule[],
  careType: 'watering' | 'fertilization'
): number | null => getScheduleField(schedules, careType, 'frequencyDays')
