import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { Session } from '@lily/api/services/auth/session'
import { NotificationNotFoundError } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect } from 'effect'

// Mark notification as read
export const markNotificationRead = (
  notificationId: string
): Effect.Effect<
  Notification,
  SqlError | NotificationNotFoundError,
  NotificationRepository | Session
> =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    const { userId } = yield* Session

    // Find the notification and verify ownership
    const notification = yield* repo.findById(notificationId)

    if (!notification || notification.userId !== userId) {
      return yield* Effect.fail(new NotificationNotFoundError())
    }

    // Mark as read
    const updated = yield* repo.markAsRead(notificationId)

    return updated as Notification
  })
