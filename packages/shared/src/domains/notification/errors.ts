import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class NotificationNotFoundError extends Schema.TaggedError<NotificationNotFoundError>()(
  'NotificationNotFoundError',
  {
    notificationId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}
