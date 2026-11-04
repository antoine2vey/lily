import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import {
  UserRepository,
  type VacationSnapshot,
} from '@lily/api/repositories/user.repository'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import {
  type ReminderContext,
  rebuildMemberReminders,
  rescheduleReminders,
} from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import type { users } from '@lily/db/schema'
import { startOfDay } from '@lily/shared'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { DateTime, Duration, Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
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
): Effect.Effect<typeof users.$inferSelect | null, SqlError, ReminderContext> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const plantRepo = yield* PlantRepository
    const ownPlantIds = yield* plantRepo.findIdsOwnedBy(params.user.id)
    const ownedOrCaredForPlantIds =
      yield* plantRepo.findPersonalReminderPlantIds(params.user.id)
    const claimed = yield* withReminderKeys(
      reminderKeysFor(ownedOrCaredForPlantIds),
      Option.some(params.user.id)
    )(
      endVacationForOwnedOrCaredForPlants(
        params,
        ownPlantIds,
        ownedOrCaredForPlantIds
      )
    )
    if (claimed === null) return null
    yield* sql.withTransaction(
      lockMyCanopy(params.user.id).pipe(
        Effect.andThen(rebuildMemberReminders(params.user.id)),
        Effect.catchTag('CanopyNotFoundError', () => Effect.void)
      )
    )
    return claimed
  }).pipe(
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
    const delegationRepo = yield* DelegationRepository

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

    const undelegated = yield* Effect.filter(ownPlantIds, (plantId) =>
      Effect.map(
        delegationRepo.findActiveCaretakerForPlant(plantId),
        (caretakerId) => caretakerId === null
      )
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
