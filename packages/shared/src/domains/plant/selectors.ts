import { Array, type Option } from 'effect'
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
