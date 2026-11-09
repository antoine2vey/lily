import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  heardBy,
  RecipientRepository,
} from '@lily/api/repositories/recipient.repository'
import {
  UserRepository,
  type VacationSnapshot,
} from '@lily/api/repositories/user.repository'
import { changeMember } from '@lily/api/services/plants/helpers/plant-change'
import {
  type ReminderContext,
  rebuildMemberReminders,
  rescheduleReminders,
} from '@lily/api/services/plants/helpers/reconcile-reminders'
import type { users } from '@lily/db/schema'
import { startOfDay } from '@lily/shared'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface EndVacationParams {
  readonly user: VacationSnapshot & Pick<typeof users.$inferSelect, 'timezone'>
  /** The stored vacationEnd (scheduler) or `now` (manual end-early). */
  readonly effectiveEnd: Date
}

/**
 * End a user's vacation: claim the transition, shift the care schedules
 * that fell due while they were away, then rebuild care reminders.
 *
 * Shift (mirrors correct-care-dates.ts): each non-delegated schedule with
 * `nextCareAt < effectiveEnd` moves forward by the whole-local-day delta
 * between vacationStart and effectiveEnd, clamped to no earlier than the
 * start of the day after effectiveEnd ("tomorrow"). Applying the delta —
 * instead of resetting from today — preserves relative spacing between
 * plants and any weather adjustment baked into nextCareAt. The clamp gives
 * tasks that were already overdue before the vacation a gentle restart.
 *
 * Plants with an active caretaker are skipped: the caretaker maintained
 * their schedules, and their reminder rows route to the caretaker.
 */
export const endVacation = (
  params: EndVacationParams
): Effect.Effect<
  typeof users.$inferSelect | null,
  SqlError,
  ReminderContext | DelegationRepository
> =>
  changeMember(params.user.id)(({ own, personal, canopy }) =>
    Effect.gen(function* () {
      const claimed = yield* endVacationForOwnedOrCaredForPlants(
        params,
        own,
        personal
      )
      if (claimed === null) return null
      yield* rebuildMemberReminders(params.user.id, canopy)
      return claimed
    })
  ).pipe(
    Effect.withSpan('VacationService.endVacation', {
      attributes: { 'user.id': params.user.id },
    })
  )

const endVacationForOwnedOrCaredForPlants = (
  params: EndVacationParams,
  ownPlantIds: ReadonlyArray<string>,
  ownedOrCaredForPlantIds: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const { user, effectiveEnd } = params
    const userRepo = yield* UserRepository
    const scheduleRepo = yield* CareScheduleRepository
    const recipientRepo = yield* RecipientRepository

    const claimed = yield* userRepo.transitionVacation(user, {
      vacationStatus: 'none',
      vacationStart: null,
      vacationEnd: null,
    })
    if (!claimed) {
      return null
    }

    const timezone = pipe(
      Option.fromNullishOr(user.timezone),
      Option.getOrElse(() => 'UTC')
    )
    // Missing vacationStart (defensive) degrades to delta 0 — the floor
    // clamp alone still moves overdue tasks to tomorrow.
    const vacationStart = pipe(
      Option.fromNullishOr(user.vacationStart),
      Option.getOrElse(() => effectiveEnd)
    )

    const effectiveEndDt = DateTime.makeUnsafe(effectiveEnd)
    const deltaMs = Duration.toMillis(
      DateTime.distance(
        startOfDay(DateTime.makeUnsafe(vacationStart), timezone),
        startOfDay(effectiveEndDt, timezone)
      )
    )
    const floor = DateTime.toDateUtc(
      DateTime.addDuration(
        startOfDay(effectiveEndDt, timezone),
        Duration.days(1)
      )
    )

    const audience = yield* recipientRepo.audienceOf(ownPlantIds)
    const undelegated = Array.filter(ownPlantIds, (plantId) =>
      Array.every(heardBy(audience, plantId), (id) => id === user.id)
    )
    yield* scheduleRepo.shiftDueBefore({
      plantIds: undelegated,
      before: effectiveEnd,
      shiftMs: deltaMs,
      floor,
    })

    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.deletePendingByUserIdAndTypes(
      user.id,
      VACATION_MUTED_TOPICS
    )

    yield* rescheduleReminders(ownedOrCaredForPlantIds)
    return claimed
  })
