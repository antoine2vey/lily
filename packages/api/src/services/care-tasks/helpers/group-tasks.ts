import { CareReads, DueScope, DueWindow } from '@lily/api/contexts/care'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { memberCanopyId } from '@lily/api/services/care-tasks/helpers/member-canopy'
import {
  buildLiveActivityCareTypeLabel,
  buildLiveActivityHeadline,
  buildLiveActivitySubheadline,
  buildLiveActivityTitle,
} from '@lily/api/services/notification-scheduler/translations/live-activity'
import { CareDay, CareDays, type CareType } from '@lily/shared'
import type {
  CareGroupContent,
  LiveActivityContentState,
} from '@lily/shared/server'
import { Array, DateTime, Effect, Option, pipe, Record } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// v3 adds server-rendered `title` + per-group `label` (widget can't reach i18next).
const LIVE_ACTIVITY_SCHEMA_VERSION = 3

const EPOCH_DAY = CareDay.make('1970-01-01')

/**
 * Picks the lock-screen title. It changes once per day of `timezone`, not on
 * every activity update, which would flicker the bold first line.
 */
export const titleSeedOf = (timezone: string, now: DateTime.DateTime): number =>
  CareDays.daysBetween(EPOCH_DAY, CareDays.today(timezone, now))

export const buildLiveActivityContentState = (
  userId: string
): Effect.Effect<
  LiveActivityContentState | null,
  SqlError,
  CareLogRepository | CareReads | UserRepository | CanopyRepository
> =>
  Effect.gen(function* () {
    const reads = yield* CareReads
    const userRepo = yield* UserRepository
    const careLogRepo = yield* CareLogRepository

    const user = yield* userRepo.findById(userId)
    const userOpt = Option.fromNullishOr(user)
    const timezone = pipe(
      userOpt,
      Option.flatMap((u) => Option.fromNullishOr(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )
    const language = pipe(
      userOpt,
      Option.flatMap((u) => Option.fromNullishOr(u.language)),
      Option.getOrElse(() => 'en' as const)
    )

    const now = DateTime.nowUnsafe()
    const canopyId = yield* memberCanopyId(userId)
    const dueSchedules = yield* reads.due({
      scope: DueScope.CaredForBy({ userId, canopyId }),
      upTo: DueWindow.DueOrOverdue(),
    })

    if (Array.isReadonlyArrayEmpty(dueSchedules)) {
      return null
    }

    const byType = Array.groupBy(dueSchedules, (s): string => s.careType)

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

    const title = buildLiveActivityTitle(language, titleSeedOf(timezone, now))
    const headline = buildLiveActivityHeadline(totalPlants, language)
    const subheadline = buildLiveActivitySubheadline(groups, language)

    // Task-count (not plant-count) — pairs with dueSchedules.length for a
    // coherent progress-bar ratio inside the widget.
    const completedToday = yield* careLogRepo.countTodayByUser(
      userId,
      timezone,
      canopyId
    )

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
