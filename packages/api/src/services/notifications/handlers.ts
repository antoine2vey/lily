import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { Auth } from '@lily/api/services/auth/auth'
import { withSession } from '@lily/api/services/auth/session'
import { NotificationsService } from '@lily/api/services/notifications/service'
import { Effect, Layer } from 'effect'

// Implement the Notifications API group
export const NotificationsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'notifications', (handlers) =>
    Effect.gen(function* () {
      const notificationsService = yield* NotificationsService

      return handlers
        .handle('getNotifications', ({ urlParams }) =>
          withSession(
            notificationsService.getNotifications({
              page: parseInt(urlParams.page, 10) || 1,
              limit: parseInt(urlParams.limit, 10) || 20,
              status: ['pending', 'queued', 'sent', 'failed'].includes(
                urlParams.status
              )
                ? (urlParams.status as 'pending' | 'queued' | 'sent' | 'failed')
                : 'all',
            })
          )
        )
        .handle('markNotificationRead', ({ path: { notificationId } }) =>
          withSession(notificationsService.markNotificationRead(notificationId))
        )
    })
  ).pipe(
    Layer.provide(NotificationsService.Default),
    Layer.provide(NotificationRepositoryLive),
    Layer.provide(Auth.Default)
  )
