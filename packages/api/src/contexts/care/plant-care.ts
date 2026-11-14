import {
  type CareDay,
  CareDays,
  type CareStatus,
  type CareType,
  careStatus,
  type PlantHealthStatus,
} from '@lily/shared'
import { Array, type DateTime } from 'effect'

export interface StoredSchedule {
  readonly careType: CareType
  readonly frequencyDays: number
  readonly lastCareAt: Date | null
  readonly nextCareAt: Date
  readonly dueDay: CareDay
}

export interface SeenSchedule extends StoredSchedule {
  readonly status: CareStatus
}

export interface PlantCare {
  readonly careTimezone: string
  readonly today: CareDay
  readonly schedules: Array<SeenSchedule>
  readonly health: PlantHealthStatus
}

const isOverdue = (schedule: SeenSchedule): boolean =>
  schedule.status._tag === 'Overdue'

export const hasOverdueCare = (plant: {
  readonly schedules: ReadonlyArray<SeenSchedule>
}): boolean => Array.some(plant.schedules, isOverdue)

export type PlantCondition = Exclude<PlantHealthStatus, 'NEEDS_ATTENTION'>

const seenHealth = (
  condition: PlantCondition,
  living: boolean,
  overdue: boolean
): PlantHealthStatus =>
  living && overdue && (condition === 'HEALTHY' || condition === 'THRIVING')
    ? 'NEEDS_ATTENTION'
    : condition

const see = (
  condition: PlantCondition,
  living: boolean,
  schedules: ReadonlyArray<StoredSchedule>,
  careTimezone: string,
  now: DateTime.DateTime
): PlantCare => {
  const today = CareDays.today(careTimezone, now)
  const seen = Array.map(
    schedules,
    (schedule): SeenSchedule => ({
      careType: schedule.careType,
      frequencyDays: schedule.frequencyDays,
      lastCareAt: schedule.lastCareAt,
      nextCareAt: schedule.nextCareAt,
      dueDay: schedule.dueDay,
      status: careStatus(schedule.dueDay, today),
    })
  )
  return {
    careTimezone,
    today,
    schedules: seen,
    health: seenHealth(condition, living, Array.some(seen, isOverdue)),
  }
}

export const seePlantCare = (
  plant: { readonly health: PlantCondition; readonly diedAt: Date | null },
  schedules: ReadonlyArray<StoredSchedule>,
  careTimezone: string,
  now: DateTime.DateTime
): PlantCare =>
  see(plant.health, plant.diedAt === null, schedules, careTimezone, now)

export const seeLivingPlantCare = (
  condition: PlantCondition,
  schedules: ReadonlyArray<StoredSchedule>,
  careTimezone: string,
  now: DateTime.DateTime
): PlantCare => see(condition, true, schedules, careTimezone, now)
