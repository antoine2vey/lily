import { Data, Schema } from 'effect'

// Notification topics - extensible for new notification types
export const NotificationTopic = Schema.Union(
  Schema.Literal('watering_reminder'),
  Schema.Literal('fertilization_reminder')
)
export type NotificationTopic = typeof NotificationTopic.Type

// Queue message payload for notifications
export const QueueMessagePayload = Schema.Struct({
  notificationId: Schema.String,
  userId: Schema.String,
  plantId: Schema.optional(Schema.String),
  title: Schema.String,
  body: Schema.String,
  data: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ),
})
export type QueueMessagePayload = typeof QueueMessagePayload.Type

// Full queue message with metadata
export const QueueMessage = Schema.Struct({
  id: Schema.String,
  topic: NotificationTopic,
  payload: QueueMessagePayload,
  retryCount: Schema.Number,
  createdAt: Schema.Date,
  scheduledAt: Schema.Date,
})
export type QueueMessage = typeof QueueMessage.Type

// Error types
export class QueueConnectionError extends Data.TaggedError(
  'QueueConnectionError'
)<{
  message: string
  cause?: unknown
}> {}

export class QueueOperationError extends Data.TaggedError(
  'QueueOperationError'
)<{
  message: string
  cause?: unknown
}> {}
