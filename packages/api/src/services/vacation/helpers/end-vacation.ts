import { Care, DueMove } from '@lily/api/contexts/care'
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
import { CARE_TYPES, startOfDay } from '@lily/shared'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'
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
 * Plants with an active caretaker are skipped: the caretaker maintained
 * their schedules, and their reminder rows route to the caretaker.
 */
export const endVacation = (
  params: EndVacationParams
): Effect.Effect<
  typeof users.$inferSelect | null,
  SqlError,
  ReminderContext | Care
> =>
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
    const care = yield* Care
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
    const daysAway = Math.round(
      Duration.toDays(
        DateTime.distance(
          startOfDay(DateTime.makeUnsafe(vacationStart), timezone),
          startOfDay(effectiveEndDt, timezone)
        )
      )
    )

    const undelegated = yield* Effect.filter(ownPlantIds, (plantId) =>
      Effect.map(
        delegationRepo.findActiveCaretakerForPlant(plantId),
        (caretakerId) => caretakerId === null
      )
    )
    yield* care.moveDueDays({
      reason: 'vacation',
      moves: Array.flatMap(undelegated, (plantId) =>
        Array.map(CARE_TYPES, (careType) => ({
          plantId,
          careType,
          move: DueMove.AfterAbsence({
            endedAt: effectiveEndDt,
            days: daysAway,
          }),
        }))
      ),
    })

    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.deletePendingByUserIdAndTypes(
      user.id,
      VACATION_MUTED_TOPICS
    )

    yield* rescheduleReminders(ownedOrCaredForPlantIds)
    return claimed
  })
