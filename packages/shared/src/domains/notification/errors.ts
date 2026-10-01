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

// ─── Overdue scheduler skip errors ──────────────────────────────────
// These represent expected skip reasons during per-user overdue processing.
// They flow through the Effect error channel so callers can handle them
// with catchTags for structured logging / metrics.

export class CareRemindersDisabledError extends Data.TaggedError(
  'CareRemindersDisabledError'
)<{ userId: string }> {}

export class AlreadySentTodayError extends Data.TaggedError(
  'AlreadySentTodayError'
)<{ userId: string }> {}

export class DndWindowBlockedError extends Data.TaggedError(
  'DndWindowBlockedError'
)<{ userId: string }> {}
