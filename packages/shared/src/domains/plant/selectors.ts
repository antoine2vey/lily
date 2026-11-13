import { Array, Match, Option, pipe } from 'effect'
import type { CareType } from '../care/types'
import type { PlantCareSchedule } from './schema'

export const getScheduleByType = (
  schedules: readonly PlantCareSchedule[],
  careType: CareType
): Option.Option<PlantCareSchedule> =>
  Array.findFirst(schedules, (s) => s.careType === careType)

export const getWateringSchedule = (
  schedules: readonly PlantCareSchedule[]
): Option.Option<PlantCareSchedule> => getScheduleByType(schedules, 'watering')

export const getFertilizationSchedule = (
  schedules: readonly PlantCareSchedule[]
): Option.Option<PlantCareSchedule> =>
  getScheduleByType(schedules, 'fertilization')

export const getMistingSchedule = (
  schedules: readonly PlantCareSchedule[]
): Option.Option<PlantCareSchedule> => getScheduleByType(schedules, 'misting')

export const getRepottingSchedule = (
  schedules: readonly PlantCareSchedule[]
): Option.Option<PlantCareSchedule> => getScheduleByType(schedules, 'repotting')

// Convenience accessors — return nullable values directly,
// avoiding repeated Option.match boilerplate in screens.

const getScheduleField = <K extends keyof PlantCareSchedule>(
  schedules: readonly PlantCareSchedule[],
  careType: CareType,
  field: K
): PlantCareSchedule[K] | null =>
  pipe(
    getScheduleByType(schedules, careType),
    Option.map((s) => s[field]),
    Option.getOrNull
  )

export const getNextCareAt = (
  schedules: readonly PlantCareSchedule[],
  careType: CareType
): Date | null => getScheduleField(schedules, careType, 'nextCareAt')

export const getLastCareAt = (
  schedules: readonly PlantCareSchedule[],
  careType: CareType
): Date | null => getScheduleField(schedules, careType, 'lastCareAt')

export const getFrequencyDays = (
  schedules: readonly PlantCareSchedule[],
  careType: CareType
): number | null => getScheduleField(schedules, careType, 'frequencyDays')

/**
 * Days until a care is due on the plant's own care day, as the API decided
 * it: negative when overdue, 0 when due today, null when unscheduled.
 */
export const getDaysUntilCare = (
  schedules: readonly PlantCareSchedule[],
  careType: CareType
): number | null =>
  pipe(
    getScheduleByType(schedules, careType),
    Option.flatMap((schedule) => Option.fromNullishOr(schedule.status)),
    Option.map((status) =>
      Match.valueTags(status, {
        Overdue: ({ daysLate }) => -daysLate,
        DueToday: () => 0,
        Upcoming: ({ inDays }) => inDays,
      })
    ),
    Option.getOrNull
  )
