import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import {
  type CareTask,
  type CareTasksResponse,
  endOfWeek,
  isOverdueByDay,
  isThisWeek,
  isToday,
} from '@lily/shared'
import { Array, DateTime, Effect, Option, Order, pipe } from 'effect'

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
    const endOfWeekDt = endOfWeek(now)
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
      isOverdueByDay(DateTime.unsafeMake(task.dueDate), now)
    )
    const today = Array.filter(tasks, (task) =>
      isToday(DateTime.unsafeMake(task.dueDate), now)
    )
    const thisWeek = Array.filter(tasks, (task) =>
      isThisWeek(DateTime.unsafeMake(task.dueDate), now)
    )

    // Sort each group by due date (earliest first)
    return {
      overdue: Array.sort(overdue, taskDueDateOrder),
      today: Array.sort(today, taskDueDateOrder),
      thisWeek: Array.sort(thisWeek, taskDueDateOrder),
    }
  })
