import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware'
import { PaginationParams } from '@lily/shared'
import { DatabaseError } from '@lily/shared/errors/database'
import {
  Notification,
  NotificationsListResponse,
} from '@lily/shared/notification'
import { Schema } from 'effect'

// Path parameter for notification ID
const notificationIdParam = HttpApiSchema.param('notificationId', Schema.String)

// Query parameters for notifications listing (extends base pagination)
export const NotificationsQueryParams = Schema.Struct({
  ...PaginationParams.fields,
  status: Schema.optionalWith(Schema.String, { default: () => 'all' }),
})

// Define the Notifications API group
export const NotificationsApi = HttpApiGroup.make('notifications')
  .add(
    // GET /notifications - List notifications with pagination
    HttpApiEndpoint.get('getNotifications')`/`
      .setUrlParams(NotificationsQueryParams)
      .addSuccess(NotificationsListResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // PUT /notifications/:notificationId/read - Mark notification as read
    HttpApiEndpoint.put('markNotificationRead')`/${notificationIdParam}/read`
      .addSuccess(Notification)
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/notifications')
  .middleware(Authentication)
