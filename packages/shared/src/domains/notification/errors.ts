import { Data, Effect, Schema } from 'effect'

export class NotificationNotFoundError extends Schema.TaggedError<NotificationNotFoundError>()(
  'NotificationNotFoundError',
  {
    notificationId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

/** Quiet hours cover both windows an overdue digest may go out in. */
export class DndWindowBlockedError extends Data.TaggedError(
  'DndWindowBlockedError'
)<{ userId: string }> {}
