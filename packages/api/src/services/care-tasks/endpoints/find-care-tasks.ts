import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import type { CareTask, CareTasksResponse } from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

// Helper to get start of day
const startOfDay = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

// Helper to get end of day
const endOfDay = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

// Helper to get end of week (Sunday)
const getEndOfWeek = (date: Date): Date => {
  const d = new Date(date)
  const dayOfWeek = d.getDay()
  const daysUntilSunday = 7 - dayOfWeek
  d.setDate(d.getDate() + daysUntilSunday)
  d.setHours(23, 59, 59, 999)
  return d
}

// Check if date is before start of today
const isOverdue = (date: Date, today: Date): boolean =>
  date.getTime() < startOfDay(today).getTime()

// Check if date is today
const isToday = (date: Date, today: Date): boolean => {
  const start = startOfDay(today)
  const end = endOfDay(today)
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime()
}

// Check if date is this week (after today, before end of week)
const isThisWeek = (date: Date, today: Date, endOfWeek: Date): boolean => {
  const afterToday = date.getTime() > endOfDay(today).getTime()
  const beforeEndOfWeek = date.getTime() <= endOfWeek.getTime()
  return afterToday && beforeEndOfWeek
}

interface PlantWithSchedule {
  id: string
  name: string
  imageUrl: string | null
  nextWateringAt: Date | null
  nextFertilizationAt: Date | null
}

// Create task from plant and date
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

// Get care tasks grouped by overdue, today, thisWeek
export const findCareTasks = (): Effect.Effect<
  CareTasksResponse,
  SqlError,
  PlantRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const { id: userId } = yield* CurrentUser

    const now = new Date()
    const endOfWeek = getEndOfWeek(now)

    // Get plants with pending care
    const plants = yield* repo.findPlantsWithPendingCare(userId, endOfWeek)

    // Generate tasks from plants
    const tasks: CareTask[] = []

    Array.forEach(plants, (plant) => {
      // Check watering schedule
      pipe(
        Option.fromNullable(plant.nextWateringAt),
        Option.map((date) => {
          if (date.getTime() <= endOfWeek.getTime()) {
            tasks.push(createTask(plant, 'water', date))
          }
        })
      )

      // Check fertilization schedule
      pipe(
        Option.fromNullable(plant.nextFertilizationAt),
        Option.map((date) => {
          if (date.getTime() <= endOfWeek.getTime()) {
            tasks.push(createTask(plant, 'fertilize', date))
          }
        })
      )
    })

    // Group tasks by date category
    const overdue = Array.filter(tasks, (task) => isOverdue(task.dueDate, now))
    const today = Array.filter(tasks, (task) => isToday(task.dueDate, now))
    const thisWeek = Array.filter(tasks, (task) =>
      isThisWeek(task.dueDate, now, endOfWeek)
    )

    // Sort each group by due date (earliest first)
    const sortByDueDate = (a: CareTask, b: CareTask) =>
      a.dueDate.getTime() - b.dueDate.getTime()

    return {
      overdue: [...overdue].sort(sortByDueDate),
      today: [...today].sort(sortByDueDate),
      thisWeek: [...thisWeek].sort(sortByDueDate),
    }
  })
