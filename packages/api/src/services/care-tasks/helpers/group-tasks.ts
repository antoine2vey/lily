import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  buildLiveActivityCareTypeLabel,
  buildLiveActivityHeadline,
  buildLiveActivitySubheadline,
  buildLiveActivityTitle,
} from '@lily/api/services/notification-scheduler/translations'
import type { CareType } from '@lily/shared'
import { endOfDay } from '@lily/shared'
import type {
  CareGroupContent,
  LiveActivityContentState,
} from '@lily/shared/server'
import { Array, DateTime, Effect, Option, pipe, Record } from 'effect'

// v3 adds server-rendered `title` + per-group `label` (widget can't reach i18next).
const LIVE_ACTIVITY_SCHEMA_VERSION = 3

// `exclude` strips one (plantId, careType) pair — the `CareLogCreated` event
// fires BEFORE execute-plant-care updates `next_care_at`, so without this the
// just-completed task would still count as due.
export const buildLiveActivityContentState = (
  userId: string,
  exclude?: { plantId: string; careType: CareType }
): Effect.Effect<
  LiveActivityContentState | null,
  SqlError,
  CareLogRepository | CareScheduleRepository | UserRepository
> =>
  Effect.gen(function* () {
    const scheduleRepo = yield* CareScheduleRepository
    const userRepo = yield* UserRepository
    const careLogRepo = yield* CareLogRepository

    const user = yield* userRepo.findById(userId)
    const userOpt = Option.fromNullable(user)
    const timezone = pipe(
      userOpt,
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )
    const language = pipe(
      userOpt,
      Option.flatMap((u) => Option.fromNullable(u.language)),
      Option.getOrElse(() => 'en' as const)
    )

    const now = DateTime.unsafeNow()
    // Match find-care-tasks.ts boundary: end of today in user's timezone.
    const cutoffDt = endOfDay(now, timezone)
    const cutoffDate = DateTime.toDateUtc(cutoffDt)

    const schedules = yield* scheduleRepo.findPendingByUser(userId, cutoffDate)

    const dueSchedules = Array.filter(schedules, (s) => {
      const next = s.schedule.nextCareAt
      if (!next) return false
      if (!DateTime.lessThanOrEqualTo(DateTime.unsafeMake(next), cutoffDt)) {
        return false
      }
      if (
        exclude &&
        s.plant.id === exclude.plantId &&
        s.schedule.careType === exclude.careType
      ) {
        return false
      }
      return true
    })

    if (Array.isEmptyReadonlyArray(dueSchedules)) {
      return null
    }

    const byType = Array.groupBy(dueSchedules, (s) => s.schedule.careType)

    const groups: CareGroupContent[] = pipe(
      Record.toEntries(byType),
      Array.map(([careType, schedulesForType]) => ({
        careType: careType as CareType,
        count: schedulesForType.length,
        firstPlantName: pipe(
          Array.head(schedulesForType),
          Option.map((s) => s.plant.name),
          Option.getOrUndefined
        ),
        label: buildLiveActivityCareTypeLabel(careType as CareType, language),
      }))
    )

    // Count of distinct plants (a plant needing water + fertilizer counts
    // once) — matches the user's mental model, not the task-grid count.
    const totalPlants = Array.length(
      Array.dedupe(Array.map(dueSchedules, (s) => s.plant.id))
    )

    // Day-stable seed: rotates the lock-screen title once per day rather than
    // on every activity update (which would flicker the bold first line).
    const titleSeed = Math.floor(DateTime.toEpochMillis(now) / 86_400_000)
    const title = buildLiveActivityTitle(language, titleSeed)
    const headline = buildLiveActivityHeadline(totalPlants, language)
    const subheadline = buildLiveActivitySubheadline(groups, language)

    // Task-count (not plant-count) — pairs with dueSchedules.length for a
    // coherent progress-bar ratio inside the widget.
    const completedToday = yield* careLogRepo.countTodayByUser(userId, timezone)

    return {
      schemaVersion: LIVE_ACTIVITY_SCHEMA_VERSION,
      totalPlants,
      groups,
      headline,
      ...(subheadline !== undefined ? { subheadline } : {}),
      title,
      completedToday,
      updatedAt: DateTime.toDateUtc(now),
    } satisfies LiveActivityContentState
  }).pipe(Effect.withSpan('LiveActivity.buildContentState'))
