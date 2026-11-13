import {
  type CareDay,
  CareDays,
  type CareStatus,
  type CareType,
  dueDayAndStatus,
  type PlantHealthStatus,
} from '@lily/shared'
import { Array, type DateTime } from 'effect'

export interface StoredSchedule {
  readonly careType: CareType
  readonly frequencyDays: number
  readonly lastCareAt: Date | null
  readonly nextCareAt: Date | null
}

export interface SeenSchedule extends StoredSchedule {
  readonly dueDay: CareDay | null
  readonly status: CareStatus | null
}

export interface PlantCare {
  readonly careTimezone: string
  readonly today: CareDay
  readonly schedules: Array<SeenSchedule>
  readonly health: PlantHealthStatus
}

const isOverdue = (schedule: SeenSchedule): boolean =>
  schedule.status?._tag === 'Overdue'

export const hasOverdueCare = (plant: {
  readonly schedules: ReadonlyArray<SeenSchedule>
}): boolean => Array.some(plant.schedules, isOverdue)

/** The health a plant can be stored with. */
export type PlantCondition = Exclude<PlantHealthStatus, 'NEEDS_ATTENTION'>

// Rows written before health became derived can still hold the old value.
const storedCondition = (health: PlantHealthStatus): PlantCondition =>
  health === 'NEEDS_ATTENTION' ? 'HEALTHY' : health

const seenHealth = (
  condition: PlantCondition,
  living: boolean,
  overdue: boolean
): PlantHealthStatus =>
  living && overdue && (condition === 'HEALTHY' || condition === 'THRIVING')
    ? 'NEEDS_ATTENTION'
    : condition

const see = (
  health: PlantHealthStatus,
  living: boolean,
  schedules: ReadonlyArray<StoredSchedule>,
  careTimezone: string,
  now: DateTime.DateTime
): PlantCare => {
  const seen = Array.map(
    schedules,
    (schedule): SeenSchedule => ({
      careType: schedule.careType,
      frequencyDays: schedule.frequencyDays,
      lastCareAt: schedule.lastCareAt,
      nextCareAt: schedule.nextCareAt,
      ...dueDayAndStatus(schedule.nextCareAt, careTimezone, now),
    })
  )
  return {
    careTimezone,
    today: CareDays.today(careTimezone, now),
    schedules: seen,
    health: seenHealth(
      storedCondition(health),
      living,
      Array.some(seen, isOverdue)
    ),
  }
}

export const seePlantCare = (
  plant: { readonly health: PlantHealthStatus; readonly diedAt: Date | null },
  schedules: ReadonlyArray<StoredSchedule>,
  careTimezone: string,
  now: DateTime.DateTime
): PlantCare =>
  see(plant.health, plant.diedAt === null, schedules, careTimezone, now)

export const seeLivingPlantCare = (
  health: PlantHealthStatus,
  schedules: ReadonlyArray<StoredSchedule>,
  careTimezone: string,
  now: DateTime.DateTime
): PlantCare => see(health, true, schedules, careTimezone, now)
