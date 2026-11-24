import {
  type NotificationTable,
  untested,
} from '@lily/api/__tests__/mocks/notification-table'
import {
  type FindNotificationsParams,
  NotificationInbox,
} from '@lily/api/repositories/notification-inbox.repository'
import { paginate } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export const createMockNotificationInbox = (
  table: NotificationTable
): Layer.Layer<NotificationInbox> => {
  const { rows: notificationsState } = table

  return Layer.succeed(
    NotificationInbox,
    NotificationInbox.of({
      findByUserId: (params: FindNotificationsParams) => {
        const page = pipe(
          Option.fromNullishOr(params.page),
          Option.getOrElse(() => 1)
        )
        const limit = pipe(
          Option.fromNullishOr(params.limit),
          Option.getOrElse(() => 20)
        )
        const offset = (page - 1) * limit

        let filtered = Array.filter(
          notificationsState,
          (n) => n.userId === params.userId
        )

        if (params.status && params.status !== 'all') {
          filtered = Array.filter(filtered, (n) => n.status === params.status)
        }

        const sorted = [...filtered].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )

        const total = sorted.length
        const items = sorted.slice(offset, offset + limit)

        return Effect.succeed(paginate(items, total, page, limit))
      },

      findById: (id: string) =>
        Effect.succeed(
          pipe(
            Array.findFirst(notificationsState, (n) => n.id === id),
            Option.getOrNull
          )
        ),

      markAsRead: (id: string) => {
        const notificationOption = Array.findFirst(
          notificationsState,
          (n) => n.id === id
        )
        return Option.match(notificationOption, {
          onNone: () => Effect.succeed(null),
          onSome: (notification) =>
            Effect.succeed({ ...notification, isRead: true }),
        })
      },

      delete: untested('delete'),

      countUnreadByUserId: untested('countUnreadByUserId'),

      markAllAsReadByUserId: untested('markAllAsReadByUserId'),
    })
  )
}
