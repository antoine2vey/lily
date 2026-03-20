import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { deleteNotification } from '@lily/api/services/notifications/endpoints/delete-notification'
import { getNotifications } from '@lily/api/services/notifications/endpoints/get-notifications'
import { getUnreadCount } from '@lily/api/services/notifications/endpoints/get-unread-count'
import { markAllRead } from '@lily/api/services/notifications/endpoints/mark-all-read'
import { markNotificationRead } from '@lily/api/services/notifications/endpoints/mark-notification-read'
import { Array, Option, pipe } from 'effect'

const VALID_STATUSES: ReadonlyArray<string> = [
  'pending',
  'queued',
  'sent',
  'failed',
]

const safeParseInt = (value: string, fallback: number): number =>
  pipe(
    Option.fromNullable(value),
    Option.flatMap((v) => {
      const parsed = Number.parseInt(v, 10)
      return Number.isNaN(parsed) ? Option.none() : Option.some(parsed)
    }),
    Option.getOrElse(() => fallback)
  )

export const NotificationsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'notifications', (handlers) =>
    handlers
      .handle('getNotifications', ({ urlParams }) =>
        getNotifications({
          page: safeParseInt(urlParams.page, 1),
          limit: safeParseInt(urlParams.limit, 20),
          status: Array.contains(VALID_STATUSES, urlParams.status)
            ? (urlParams.status as 'pending' | 'queued' | 'sent' | 'failed')
            : 'all',
        }).pipe(withInfraErrorsAsDefect)
      )
      .handle('getUnreadCount', () =>
        getUnreadCount().pipe(withInfraErrorsAsDefect)
      )
      .handle('markAllRead', () => markAllRead().pipe(withInfraErrorsAsDefect))
      .handle('markNotificationRead', ({ path: { notificationId } }) =>
        markNotificationRead(notificationId).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteNotification', ({ path: { notificationId } }) =>
        deleteNotification(notificationId).pipe(withInfraErrorsAsDefect)
      )
  )
