import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { Effect } from 'effect'

/**
 * Activate a user's vacation: delete their own pending care/engagement
 * notification rows and flip the status to 'active'.
 *
 * Caretaker-routed reminder rows for delegated plants carry the caretaker's
 * userId, so they are untouched — those reminders must survive the owner's
 * vacation. Deleting (rather than rescheduling) is correct because the
 * end-routine rebuilds all care reminders from the shifted schedules.
 */
export const activateVacation = (
  userId: string
): Effect.Effect<void, SqlError, UserRepository | NotificationRepository> =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository

    yield* notificationRepo.deletePendingByUserIdAndTypes(
      userId,
      VACATION_MUTED_TOPICS
    )
    yield* userRepo.update(userId, { vacationStatus: 'active' })
  }).pipe(
    Effect.withSpan('VacationService.activateVacation', {
      attributes: { 'user.id': userId },
    })
  )
