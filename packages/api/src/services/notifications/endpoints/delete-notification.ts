import type { SqlError } from '@effect/sql/SqlError'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { NotificationNotFoundError } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect } from 'effect'

export const deleteNotification = (
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

    // Delete the notification
    const deleted = yield* repo.delete(notificationId)

    return deleted as Notification
  }).pipe(
    Effect.withSpan('NotificationsService.deleteNotification', {
      attributes: { 'notification.id': notificationId },
    })
  )
