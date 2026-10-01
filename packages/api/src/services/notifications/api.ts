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

// Path parameter for notification ID
const notificationIdParam = Schema.String.check(Schema.isGUID())

// Query parameters for notifications listing (extends base pagination)
export const NotificationsQueryParams = Schema.Struct({
  ...PaginationParams.fields,
  status: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('all')),
    Schema.withConstructorDefault(Effect.succeed('all'))
  ),
})

// Define the Notifications API group
export const NotificationsApi = HttpApiGroup.make('notifications')
  .add(
    // GET /notifications - List notifications with pagination
    HttpApiEndpoint.get('getNotifications', '/', {
      query: NotificationsQueryParams,
      success: NotificationsListResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    // GET /notifications/unread-count - Get unread notification count
    HttpApiEndpoint.get('getUnreadCount', '/unread-count', {
      success: UnreadCountResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    // PUT /notifications/read-all - Mark all notifications as read
    HttpApiEndpoint.put('markAllRead', '/read-all', {
      success: Schema.Void,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    // PUT /notifications/:notificationId/read - Mark notification as read
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
    // DELETE /notifications/:notificationId - Delete a notification
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
