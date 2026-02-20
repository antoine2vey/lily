import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import {
  type CareTask,
  type CareTasksResponse,
  endOfDay,
  isOverdueByDay,
  isToday,
  isUpcoming,
} from '@lily/shared'
import { Array, DateTime, Effect, Option, Order, pipe } from 'effect'

interface PlantWithSchedule {
  id: string
  name: string
  imageUrl: string | null
  nextWateringAt: Date | null
  nextFertilizationAt: Date | null
  room: { id: string; name: string; icon: string } | null
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
  roomName: plant.room?.name ?? null,
  roomIcon: plant.room?.icon ?? null,
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
 * Get care tasks grouped by overdue, today, upcoming (rolling 7-day window)
 */
export const findCareTasks = (): Effect.Effect<
  CareTasksResponse,
  SqlError,
  PlantRepository | UserRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const userRepo = yield* UserRepository
    const { id: userId } = yield* CurrentUser

    const user = yield* userRepo.findById(userId)
    const timezone = pipe(
      Option.fromNullable(user),
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )

    const now = DateTime.unsafeNow()
    const cutoffDt = endOfDay(DateTime.add(now, { days: 7 }), timezone)
    const cutoffDate = DateTime.toDateUtc(cutoffDt)

    // Get plants with pending care (rolling 7-day window)
    const plants = yield* repo.findPlantsWithPendingCare(userId, cutoffDate)

    // Generate tasks from plants
    const tasks: CareTask[] = []

    Array.forEach(plants, (plant) => {
      // Check watering schedule
      pipe(
        Option.fromNullable(plant.nextWateringAt),
        Option.map((date) => {
          const dateDt = DateTime.unsafeMake(date)
          if (DateTime.lessThanOrEqualTo(dateDt, cutoffDt)) {
            tasks.push(createTask(plant, 'water', date))
          }
        })
      )

      // Check fertilization schedule
      pipe(
        Option.fromNullable(plant.nextFertilizationAt),
        Option.map((date) => {
          const dateDt = DateTime.unsafeMake(date)
          if (DateTime.lessThanOrEqualTo(dateDt, cutoffDt)) {
            tasks.push(createTask(plant, 'fertilize', date))
          }
        })
      )
    })

    // Group tasks by date category using user's timezone
    const overdue = Array.filter(tasks, (task) =>
      isOverdueByDay(DateTime.unsafeMake(task.dueDate), now, timezone)
    )
    const today = Array.filter(tasks, (task) =>
      isToday(DateTime.unsafeMake(task.dueDate), now, timezone)
    )
    const upcoming = Array.filter(tasks, (task) =>
      isUpcoming(DateTime.unsafeMake(task.dueDate), now, timezone)
    )

    // Sort each group by due date (earliest first)
    return {
      overdue: Array.sort(overdue, taskDueDateOrder),
      today: Array.sort(today, taskDueDateOrder),
      upcoming: Array.sort(upcoming, taskDueDateOrder),
    }
  }).pipe(Effect.withSpan('CareTasksService.findCareTasks'))
