import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import type { Outbox } from '@lily/api/kernel/outbox'
import { transact } from '@lily/api/kernel/transact'
import {
  exceptReminders,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import {
  UserRepository,
  type VacationSnapshot,
} from '@lily/api/repositories/user.repository'
import type { users } from '@lily/db/schema'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export interface ActivateVacationParams {
  readonly expected: VacationSnapshot
  readonly range?: { vacationStart: Date; vacationEnd: Date }
}

/**
 * Claims the transition, deletes what the user was waiting for on the muted
 * topics and asks Reminders to drop their reminders, in one transaction: a
 * failure rolls the claim back and the next poll retries. Returns null, with
 * nothing written, when a concurrent write changed the row since `expected`
 * was read.
 */
export const activateVacation = (
  params: ActivateVacationParams
): Effect.Effect<
  typeof users.$inferSelect | null,
  SqlError,
  UserRepository | NotificationRepository | SqlClient.SqlClient | Outbox
> =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const notificationRepo = yield* NotificationRepository

    return yield* transact(
      Effect.gen(function* () {
        const claimed = yield* userRepo.transitionVacation(params.expected, {
          vacationStatus: 'active',
          ...params.range,
        })
        if (!claimed) {
          return null
        }
        yield* notificationRepo.deletePendingByUserIdAndTypes(
          claimed.id,
          exceptReminders(VACATION_MUTED_TOPICS)
        )
        yield* Reminders.request(Dirty.Recipient({ userId: claimed.id }))
        return claimed
      })
    )
  }).pipe(
    Effect.withSpan('VacationService.activateVacation', {
      attributes: { 'user.id': params.expected.id },
    })
  )
