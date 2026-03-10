import { Array, Data, Schema } from 'effect'

// Notification topics - extensible for new notification types
// Add new topics here - the worker will fail at compile/runtime if not handled
export const NOTIFICATION_TOPICS = [
  'watering_reminder',
  'fertilization_reminder',
  'overdue_reminder',
  'new_follower',
  'nudge_to_water',
  'delegation_request',
  'delegation_accepted',
  'delegation_rejected',
  'delegation_canceled',
  'delegation_activated',
  'delegation_completed',
  'daily_tip',
  'inactivity_nudge',
  'plant_tip',
  'photo_reminder',
  'plant_parent_milestone',
] as const

export const NotificationTopic = Schema.Union(
  ...Array.map(NOTIFICATION_TOPICS, (t) => Schema.Literal(t))
)
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number]

// Queue message payload for notifications
export const QueueMessagePayload = Schema.Struct({
  userId: Schema.String,
  title: Schema.String,
  body: Schema.String,
  notificationIds: Schema.Array(Schema.String),
  plantIds: Schema.Array(Schema.String),
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
