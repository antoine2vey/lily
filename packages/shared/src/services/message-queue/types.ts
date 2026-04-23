import { Array, Data, Schema } from 'effect'

// Notification topics - extensible for new notification types
// Add new topics here - the worker will fail at compile/runtime if not handled
export const NOTIFICATION_TOPICS = [
  'watering_reminder',
  'fertilization_reminder',
  'misting_reminder',
  'repotting_reminder',
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
  'photo_reminder',
  'plant_parent_milestone',
  'gift_subscription',
  'resubscribe_nudge',
  'streak_at_risk',
  'streak_milestone',
  'weekly_recap',
  'trial_ending',
  'approaching_limit',
  'plant_anniversary',
] as const

export const NotificationTopic = Schema.Union(
  ...Array.map(NOTIFICATION_TOPICS, (t) => Schema.Literal(t))
)
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number]

// Topic categories — every NotificationTopic must be classified here.
// Adding a new topic to NOTIFICATION_TOPICS without categorizing it → tsc error.
export type TopicCategory = 'care' | 'social' | 'engagement'

// `as const satisfies` preserves literal types for each value while
// enforcing that every NotificationTopic key is present.
export const TOPIC_CATEGORY = {
  watering_reminder: 'care',
  fertilization_reminder: 'care',
  misting_reminder: 'care',
  repotting_reminder: 'care',
  overdue_reminder: 'care',
  new_follower: 'social',
  nudge_to_water: 'social',
  delegation_request: 'social',
  delegation_accepted: 'social',
  delegation_rejected: 'social',
  delegation_canceled: 'social',
  delegation_activated: 'social',
  delegation_completed: 'social',
  daily_tip: 'engagement',
  inactivity_nudge: 'engagement',
  photo_reminder: 'engagement',
  plant_parent_milestone: 'engagement',
  gift_subscription: 'social',
  resubscribe_nudge: 'engagement',
  streak_at_risk: 'engagement',
  streak_milestone: 'engagement',
  weekly_recap: 'engagement',
  trial_ending: 'engagement',
  approaching_limit: 'engagement',
  plant_anniversary: 'engagement',
} as const satisfies Record<NotificationTopic, TopicCategory>

// Derive subset types from the category map — adding a topic to
// NOTIFICATION_TOPICS requires adding it to TOPIC_CATEGORY, which
// automatically places it in the correct subset type.
type TopicsOfCategory<C extends TopicCategory> = {
  [K in NotificationTopic]: (typeof TOPIC_CATEGORY)[K] extends C ? K : never
}[NotificationTopic]

export type DeferredCareType = TopicsOfCategory<'care'>
export type SocialNotificationType = TopicsOfCategory<'social'>
export type EngagementNotificationType = TopicsOfCategory<'engagement'>

// Queue message payload for notifications
export const QueueMessagePayload = Schema.Struct({
  userId: Schema.String,
  title: Schema.String,
  body: Schema.String,
  notificationIds: Schema.Array(Schema.String),
  plantIds: Schema.Array(Schema.String),
  // Optional so queue messages enqueued before this field existed don't fail
  // Schema validation on dequeue. Worker defaults to 'en' when absent.
  language: Schema.optional(Schema.Literal('en', 'fr')),
  metadata: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String })
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
