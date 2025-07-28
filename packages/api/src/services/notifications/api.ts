import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { DatabaseError } from '@lily/shared/errors/database'
import { Notification } from '@lily/shared/notification'
import { Schema } from 'effect'

// Path parameter for notification ID
const notificationIdParam = HttpApiSchema.param('notificationId', Schema.String)

// Query parameter for sent filter - TODO: Fix HttpApiSchema.query compatibility
// const sentQuery = HttpApiSchema.query(
//   'sent',
//   Schema.optional(Schema.Union(Schema.Literal('true'), Schema.Literal('false')))
// )

// Define the Notifications API group
export const NotificationsApi = HttpApiGroup.make('notifications')
  .add(
    // GET /notifications - List notifications (filter by sent)
    HttpApiEndpoint.get('getNotifications')`/`
      // TODO: Add back query parameter when HttpApiSchema.query is available
      // .setUrlParams(Schema.Struct({ sent: sentQuery }))
      .addSuccess(Schema.Array(Notification))
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
