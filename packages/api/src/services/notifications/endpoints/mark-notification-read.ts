import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { NotificationNotFoundError } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect } from 'effect'

// Mark notification as read
export const markNotificationRead = (
  notificationId: string
): Effect.Effect<
  Notification,
  SqlError | NotificationNotFoundError,
  NotificationRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* NotificationRepository
    const { id: userId } = yield* CurrentUser

    // Find the notification and verify ownership
    const notification = yield* repo.findById(notificationId)

    if (!notification || notification.userId !== userId) {
      return yield* new NotificationNotFoundError()
    }

    // Mark as read
    const updated = yield* repo.markAsRead(notificationId)

    return updated as Notification
  }).pipe(
    Effect.withSpan('NotificationsService.markNotificationRead', {
      attributes: { 'notification.id': notificationId },
    })
  )
