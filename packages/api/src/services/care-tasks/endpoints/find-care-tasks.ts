import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import {
  CARE_TASK_WINDOW_DAYS,
  type CareTask,
  type CareTasksResponse,
  endOfDay,
  isOverdueByDay,
  isToday,
  isUpcoming,
  localDayKey,
  localDayOffset,
} from '@lily/shared'
import { Array, DateTime, Effect, Option, Order, pipe } from 'effect'

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
  | CareLogRepository
  | CareScheduleRepository
  | PlantRepository
  | UserRepository
  | CurrentUser
> =>
  Effect.gen(function* () {
    const careLogRepo = yield* CareLogRepository
    const scheduleRepo = yield* CareScheduleRepository
    const userRepo = yield* UserRepository
    const { id: userId } = yield* CurrentUser

    const user = yield* userRepo.findById(userId)
    const timezone = pipe(
      Option.fromNullable(user),
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )

    const now = DateTime.unsafeNow()
    const cutoffDt = endOfDay(
      DateTime.add(now, { days: CARE_TASK_WINDOW_DAYS }),
      timezone
    )
    const cutoffDate = DateTime.toDateUtc(cutoffDt)

    // Get pending schedules with plant info from schedule table
    const schedules = yield* scheduleRepo.findPendingByUser(userId, cutoffDate)

    // Generate tasks from schedules
    const tasks = Array.filterMap(schedules, (s) =>
      pipe(
        Option.fromNullable(s.schedule.nextCareAt),
        Option.filter((date) =>
          DateTime.lessThanOrEqualTo(DateTime.unsafeMake(date), cutoffDt)
        ),
        Option.map((date) => {
          const dueDt = DateTime.unsafeMake(date)
          return {
            id: `${s.plant.id}-${s.schedule.careType}`,
            plantId: s.plant.id,
            plantName: s.plant.name,
            plantImageUrl: s.plant.imageUrl,
            roomName: pipe(
              Option.fromNullable(s.plant.room),
              Option.map((r) => r.name),
              Option.getOrNull
            ),
            roomIcon: pipe(
              Option.fromNullable(s.plant.room),
              Option.map((r) => r.icon),
              Option.getOrNull
            ),
            type: s.schedule.careType,
            dueDate: date,
            dueDayOffset: localDayOffset(dueDt, now, timezone),
            localDueDate: localDayKey(dueDt, timezone),
            completed: false,
          } satisfies CareTask
        })
      )
    )

    // Group tasks by date category using user's timezone
    const overdue = Array.filter(tasks, (task) =>
      isOverdueByDay(DateTime.unsafeMake(task.dueDate), now, timezone)
    )
    const today = Array.filter(tasks, (task) =>
      isToday(DateTime.unsafeMake(task.dueDate), now, timezone)
    )
    const upcoming = Array.filter(tasks, (task) =>
      isUpcoming(
        DateTime.unsafeMake(task.dueDate),
        now,
        timezone,
        CARE_TASK_WINDOW_DAYS
      )
    )

    // Authoritative day axis for the home calendar: index 0 = today, through
    // +CARE_TASK_WINDOW_DAYS. Built in the user's timezone so the client renders
    // columns without doing any timezone math of its own.
    const windowDays = Array.makeBy(CARE_TASK_WINDOW_DAYS + 1, (i) =>
      localDayKey(DateTime.add(now, { days: i }), timezone)
    )

    // Count care actions completed today
    const completedToday = yield* careLogRepo.countTodayByUser(userId, timezone)

    // Sort each group by due date (earliest first)
    return {
      overdue: Array.sort(overdue, taskDueDateOrder),
      today: Array.sort(today, taskDueDateOrder),
      upcoming: Array.sort(upcoming, taskDueDateOrder),
      completedToday,
      windowDays,
    }
  }).pipe(Effect.withSpan('CareTasksService.findCareTasks'))
