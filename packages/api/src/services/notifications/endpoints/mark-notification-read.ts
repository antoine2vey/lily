import { NotificationInbox } from '@lily/api/repositories/notification-inbox.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { NotificationNotFoundError } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const markNotificationRead = (
  notificationId: string
): Effect.Effect<
  Notification,
  SqlError | NotificationNotFoundError,
  NotificationInbox | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* NotificationInbox
    const { id: userId } = yield* CurrentUser

    const notification = yield* repo.findById(notificationId)

    if (!notification || notification.userId !== userId) {
      return yield* new NotificationNotFoundError()
    }

    const updated = yield* repo.markAsRead(notificationId)

    return updated as Notification
  }).pipe(
    Effect.withSpan('NotificationsService.markNotificationRead', {
      attributes: { 'notification.id': notificationId },
    })
  )
