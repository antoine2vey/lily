import { storedDay } from '@lily/api/contexts/care/stored-day'
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
  readonly dueDay: string | null
}

export interface SeenSchedule extends StoredSchedule {
  readonly dueDay: CareDay
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
  const today = CareDays.today(careTimezone, now)
  const seen = Array.map(schedules, (schedule): SeenSchedule => {
    const dueDay = storedDay(schedule.dueDay, schedule.nextCareAt, careTimezone)
    return {
      careType: schedule.careType,
      frequencyDays: schedule.frequencyDays,
      lastCareAt: schedule.lastCareAt,
      nextCareAt: schedule.nextCareAt,
      dueDay,
      status: careStatus(dueDay, today),
    }
  })
  return {
    careTimezone,
    today,
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
