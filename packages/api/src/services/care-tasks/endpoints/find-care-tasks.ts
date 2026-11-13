import { CareReads, DueScope, DueWindow } from '@lily/api/contexts/care'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { memberCanopyId } from '@lily/api/services/care-tasks/helpers/member-canopy'
import {
  CARE_TASK_WINDOW_DAYS,
  CareDays,
  type CareTask,
  type CareTasksResponse,
  localDayKey,
} from '@lily/shared'
import { Array, DateTime, Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Care tasks grouped by overdue, today and upcoming (rolling 7-day window).
 * Each task is bucketed on its plant's own care day; the calendar axis and the
 * completed count use the viewer's timezone.
 */
export const findCareTasks = (
  includeCanopy: boolean
): Effect.Effect<
  CareTasksResponse,
  SqlError,
  | CanopyRepository
  | CareLogRepository
  | CareReads
  | PlantRepository
  | UserRepository
  | CurrentUser
> =>
  Effect.gen(function* () {
    const careLogRepo = yield* CareLogRepository
    const reads = yield* CareReads
    const userRepo = yield* UserRepository
    const { id: userId } = yield* CurrentUser

    const user = yield* userRepo.findById(userId)
    const timezone = pipe(
      Option.fromNullishOr(user),
      Option.flatMap((u) => Option.fromNullishOr(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )

    const canopyId = includeCanopy ? yield* memberCanopyId(userId) : null
    const due = yield* reads.due({
      scope: DueScope.CaredForBy({ userId, canopyId }),
      upTo: DueWindow.Ahead({ days: CARE_TASK_WINDOW_DAYS }),
    })

    const tasks = Array.map(due, (care) => ({
      status: care.status._tag,
      task: {
        id: `${care.plant.id}-${care.careType}`,
        plantId: care.plant.id,
        plantName: care.plant.name,
        plantImageUrl: care.plant.imageUrl,
        roomName: pipe(
          Option.fromNullishOr(care.plant.room),
          Option.map((r) => r.name),
          Option.getOrNull
        ),
        roomIcon: pipe(
          Option.fromNullishOr(care.plant.room),
          Option.map((r) => r.icon),
          Option.getOrNull
        ),
        type: care.careType,
        dueDate: care.dueAt,
        dueDayOffset: CareDays.daysBetween(care.today, care.dueDay),
        localDueDate: care.dueDay,
        completed: false,
        sharedBy: care.plant.sharedBy,
      } satisfies CareTask,
    }))
    const withStatus = (status: (typeof tasks)[number]['status']) =>
      pipe(
        tasks,
        Array.filter((t) => t.status === status),
        Array.map((t) => t.task)
      )

    const now = yield* DateTime.now
    const windowDays = Array.makeBy(CARE_TASK_WINDOW_DAYS + 1, (i) =>
      localDayKey(DateTime.add(now, { days: i }), timezone)
    )

    const completedToday = yield* careLogRepo.countTodayByUser(
      userId,
      timezone,
      canopyId
    )

    return {
      overdue: withStatus('Overdue'),
      today: withStatus('DueToday'),
      upcoming: withStatus('Upcoming'),
      completedToday,
      windowDays,
    }
  }).pipe(Effect.withSpan('CareTasksService.findCareTasks'))
