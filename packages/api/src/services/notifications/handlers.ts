import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { withSqlErrorAsDefect } from '@lily/api/services/helpers/sql-error'
import { NotificationsService } from '@lily/api/services/notifications/service'
import { Array, Effect, Layer, Option, pipe } from 'effect'

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

// Implement the Notifications API group
export const NotificationsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'notifications', (handlers) =>
    Effect.gen(function* () {
      const notificationsService = yield* NotificationsService

      return handlers
        .handle('getNotifications', ({ urlParams }) =>
          notificationsService
            .getNotifications({
              page: safeParseInt(urlParams.page, 1),
              limit: safeParseInt(urlParams.limit, 20),
              status: Array.contains(VALID_STATUSES, urlParams.status)
                ? (urlParams.status as 'pending' | 'queued' | 'sent' | 'failed')
                : 'all',
            })
            .pipe(withSqlErrorAsDefect)
        )
        .handle('markNotificationRead', ({ path: { notificationId } }) =>
          notificationsService
            .markNotificationRead(notificationId)
            .pipe(withSqlErrorAsDefect)
        )
    })
  ).pipe(
    Layer.provide(NotificationsService.Default),
    Layer.provide(NotificationRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
