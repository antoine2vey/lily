import { Care, DueMove } from '@lily/api/contexts/care'
import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import type { Outbox } from '@lily/api/kernel/outbox'
import { transact } from '@lily/api/kernel/transact'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  exceptReminders,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import {
  UserRepository,
  type VacationSnapshot,
} from '@lily/api/repositories/user.repository'
import type { users } from '@lily/db/schema'
import { CARE_TYPES, startOfDay } from '@lily/shared'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export interface EndVacationParams {
  readonly user: VacationSnapshot & Pick<typeof users.$inferSelect, 'timezone'>
  /** The stored vacationEnd (scheduler) or `now` (manual end-early). */
  readonly effectiveEnd: Date
}

/**
 * Ends a user's vacation in one transaction: claims the transition, moves
 * the cares that fell due while they were away, and asks Reminders to plan
 * the user's reminders again. Returns null, with nothing written, when a
 * concurrent write changed the row since `user` was read.
 *
 * Plants with an active caretaker are not moved: the caretaker kept their
 * schedules, and their reminders are addressed to the caretaker.
 */
export const endVacation = (
  params: EndVacationParams
): Effect.Effect<
  typeof users.$inferSelect | null,
  SqlError,
  | UserRepository
  | PlantRepository
  | DelegationRepository
  | NotificationRepository
  | Care
  | SqlClient.SqlClient
  | Outbox
> =>
  Effect.gen(function* () {
    const { user, effectiveEnd } = params
    const userRepo = yield* UserRepository
    const plantRepo = yield* PlantRepository
    const delegationRepo = yield* DelegationRepository
    const notificationRepo = yield* NotificationRepository
    const care = yield* Care

    return yield* transact(
      Effect.gen(function* () {
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

        const undelegated = yield* Effect.filter(
          yield* plantRepo.findIdsOwnedBy(user.id),
          (plantId) =>
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

        yield* notificationRepo.deletePendingByUserIdAndTypes(
          user.id,
          exceptReminders(VACATION_MUTED_TOPICS)
        )
        yield* Reminders.request(Dirty.Recipient({ userId: user.id }))
        return claimed
      })
    )
  }).pipe(
    Effect.withSpan('VacationService.endVacation', {
      attributes: { 'user.id': params.user.id },
    })
  )
