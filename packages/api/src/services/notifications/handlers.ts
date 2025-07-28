import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { NotificationsService } from '@lily/api/services/notifications/service'
import { Database } from '@lily/db'
import { Effect, Layer } from 'effect'

// Implement the Notifications API group
export const NotificationsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'notifications', (handlers) =>
    Effect.gen(function* () {
      const notificationsService = yield* NotificationsService

      return handlers
        .handle('getNotifications', () =>
          notificationsService.getNotifications()
        )
        .handle('markNotificationRead', ({ path: { notificationId } }) =>
          notificationsService.markNotificationRead(notificationId)
        )
    })
  ).pipe(
    Layer.provide(NotificationsService.Default),
    Layer.provide(Database.Default)
  )
