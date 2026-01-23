import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import type { CareTask, CareTasksResponse } from '@lily/shared'
import { Array, DateTime, Effect, Option, Order, pipe } from 'effect'

/**
 * Get start of day (00:00:00.000) for a DateTime
 */
const startOfDay = (dt: DateTime.DateTime): DateTime.DateTime => {
  const parts = DateTime.toParts(dt)
  return DateTime.unsafeMake({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hours: 0,
    minutes: 0,
    seconds: 0,
    millis: 0,
  })
}

/**
 * Get end of day (23:59:59.999) for a DateTime
 */
const endOfDay = (dt: DateTime.DateTime): DateTime.DateTime => {
  const parts = DateTime.toParts(dt)
  return DateTime.unsafeMake({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hours: 23,
    minutes: 59,
    seconds: 59,
    millis: 999,
  })
}

/**
 * Get end of week (Sunday 23:59:59.999) for a DateTime
 */
const getEndOfWeek = (dt: DateTime.DateTime): DateTime.DateTime => {
  const parts = DateTime.toParts(dt)
  const dayOfWeek = parts.weekDay // 0 = Sunday, 1 = Monday, etc.
  const daysUntilSunday = 7 - dayOfWeek

  // Add days to get to Sunday
  const sundayDate = DateTime.unsafeMake({
    year: parts.year,
    month: parts.month,
    day: parts.day + daysUntilSunday,
    hours: 23,
    minutes: 59,
    seconds: 59,
    millis: 999,
  })

  return sundayDate
}

/**
 * Check if date is before start of today (overdue)
 */
const isOverdue = (
  date: DateTime.DateTime,
  today: DateTime.DateTime
): boolean => DateTime.lessThan(date, startOfDay(today))

/**
 * Check if date is today
 */
const isToday = (
  date: DateTime.DateTime,
  today: DateTime.DateTime
): boolean => {
  const start = startOfDay(today)
  const end = endOfDay(today)
  return (
    DateTime.greaterThanOrEqualTo(date, start) &&
    DateTime.lessThanOrEqualTo(date, end)
  )
}

/**
 * Check if date is this week (after today, before end of week)
 */
const isThisWeek = (
  date: DateTime.DateTime,
  today: DateTime.DateTime,
  endOfWeek: DateTime.DateTime
): boolean => {
  const afterToday = DateTime.greaterThan(date, endOfDay(today))
  const beforeEndOfWeek = DateTime.lessThanOrEqualTo(date, endOfWeek)
  return afterToday && beforeEndOfWeek
}

interface PlantWithSchedule {
  id: string
  name: string
  imageUrl: string | null
  nextWateringAt: Date | null
  nextFertilizationAt: Date | null
}

/**
 * Create task from plant and date
 */
const createTask = (
  plant: PlantWithSchedule,
  type: 'water' | 'fertilize',
  dueDate: Date
): CareTask => ({
  id: `${plant.id}-${type}`,
  plantId: plant.id,
  plantName: plant.name,
  plantImageUrl: plant.imageUrl,
  type,
  dueDate,
  completed: false,
})

/**
 * Order for sorting tasks by due date (earliest first)
 */
const taskDueDateOrder: Order.Order<CareTask> = Order.mapInput(
  Order.number,
  (task: CareTask) => DateTime.toEpochMillis(DateTime.unsafeMake(task.dueDate))
)

/**
 * Get care tasks grouped by overdue, today, thisWeek
 */
export const findCareTasks = (): Effect.Effect<
  CareTasksResponse,
  SqlError,
  PlantRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const { id: userId } = yield* CurrentUser

    const now = DateTime.unsafeNow()
    const endOfWeekDt = getEndOfWeek(now)
    const endOfWeekDate = DateTime.toDateUtc(endOfWeekDt)

    // Get plants with pending care
    const plants = yield* repo.findPlantsWithPendingCare(userId, endOfWeekDate)

    // Generate tasks from plants
    const tasks: CareTask[] = []

    Array.forEach(plants, (plant) => {
      // Check watering schedule
      pipe(
        Option.fromNullable(plant.nextWateringAt),
        Option.map((date) => {
          const dateDt = DateTime.unsafeMake(date)
          if (DateTime.lessThanOrEqualTo(dateDt, endOfWeekDt)) {
            tasks.push(createTask(plant, 'water', date))
          }
        })
      )

      // Check fertilization schedule
      pipe(
        Option.fromNullable(plant.nextFertilizationAt),
        Option.map((date) => {
          const dateDt = DateTime.unsafeMake(date)
          if (DateTime.lessThanOrEqualTo(dateDt, endOfWeekDt)) {
            tasks.push(createTask(plant, 'fertilize', date))
          }
        })
      )
    })

    // Group tasks by date category
    const overdue = Array.filter(tasks, (task) =>
      isOverdue(DateTime.unsafeMake(task.dueDate), now)
    )
    const today = Array.filter(tasks, (task) =>
      isToday(DateTime.unsafeMake(task.dueDate), now)
    )
    const thisWeek = Array.filter(tasks, (task) =>
      isThisWeek(DateTime.unsafeMake(task.dueDate), now, endOfWeekDt)
    )

    // Sort each group by due date (earliest first)
    return {
      overdue: Array.sort(overdue, taskDueDateOrder),
      today: Array.sort(today, taskDueDateOrder),
      thisWeek: Array.sort(thisWeek, taskDueDateOrder),
    }
  })
