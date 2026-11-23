import { Authentication } from '@lily/api/services/auth/middleware.types'
import { PaginationParams } from '@lily/shared'
import {
  Notification,
  NotificationNotFoundError,
  NotificationsListResponse,
  UnreadCountResponse,
} from '@lily/shared/notification'
import { Effect, Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const notificationIdParam = Schema.String.check(Schema.isGUID())

export const NotificationsQueryParams = Schema.Struct({
  ...PaginationParams.fields,
  status: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('all')),
    Schema.withConstructorDefault(Effect.succeed('all'))
  ),
})

export const NotificationsApi = HttpApiGroup.make('notifications')
  .add(
    HttpApiEndpoint.get('getNotifications', '/', {
      query: NotificationsQueryParams,
      success: NotificationsListResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    HttpApiEndpoint.get('getUnreadCount', '/unread-count', {
      success: UnreadCountResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    HttpApiEndpoint.put('markAllRead', '/read-all', {
      success: Schema.Void,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    HttpApiEndpoint.put('markNotificationRead', '/:notificationId/read', {
      params: { notificationId: notificationIdParam },
      success: Notification,
      error: [
        NotificationNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete('deleteNotification', '/:notificationId', {
      params: { notificationId: notificationIdParam },
      success: Notification,
      error: [
        NotificationNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .prefix('/notifications')
  .middleware(Authentication)
