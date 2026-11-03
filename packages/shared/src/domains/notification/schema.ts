import { Schema } from 'effect'
import { NotificationTopic } from '../../services/message-queue/types'
import { PaginatedResponse } from '../common/pagination'

// Re-export errors for convenient imports
export { NotificationNotFoundError } from './errors'

// Notification status enum
export const NotificationStatus = Schema.Literals([
  'pending',
  'queued',
  'sent',
  'failed',
])
export type NotificationStatus = typeof NotificationStatus.Type

const NoMetadata = Schema.Record(Schema.String, Schema.Never)
const DelegationMetadata = Schema.Struct({
  delegationId: Schema.NonEmptyString,
})
const SenderMetadata = Schema.Struct({ senderId: Schema.NonEmptyString })
const InvitationMetadata = Schema.Struct({
  invitationId: Schema.NonEmptyString,
})

export const NOTIFICATION_METADATA = {
  watering_reminder: NoMetadata,
  fertilization_reminder: NoMetadata,
  misting_reminder: NoMetadata,
  repotting_reminder: NoMetadata,
  overdue_reminder: NoMetadata,
  new_follower: SenderMetadata,
  nudge_to_water: SenderMetadata,
  delegation_request: DelegationMetadata,
  delegation_accepted: DelegationMetadata,
  delegation_rejected: DelegationMetadata,
  delegation_canceled: DelegationMetadata,
  delegation_activated: DelegationMetadata,
  delegation_completed: DelegationMetadata,
  canopy_member_joined: NoMetadata,
  canopy_member_removed: NoMetadata,
  canopy_member_left: NoMetadata,
  canopy_invitation: InvitationMetadata,
  daily_tip: NoMetadata,
  inactivity_nudge: NoMetadata,
  photo_reminder: NoMetadata,
  plant_parent_milestone: NoMetadata,
  gift_subscription: NoMetadata,
  resubscribe_nudge: NoMetadata,
  streak_at_risk: NoMetadata,
  streak_milestone: NoMetadata,
  weekly_recap: NoMetadata,
  trial_ending: NoMetadata,
  approaching_limit: NoMetadata,
  plant_anniversary: NoMetadata,
} as const satisfies Record<NotificationTopic, Schema.Top>

export type MetadataOf<T extends NotificationTopic> =
  (typeof NOTIFICATION_METADATA)[T]['Type']

export type NotificationMetadata = MetadataOf<NotificationTopic>

// Notification schemas
export const Notification = Schema.Struct({
  id: Schema.String,
  type: NotificationTopic,
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  scheduledAt: Schema.DateFromString,
  sentAt: Schema.optional(Schema.DateFromString),
  isRead: Schema.Boolean,
  status: NotificationStatus,
  retryCount: Schema.Number,
  lastError: Schema.optional(Schema.String),
  userId: Schema.String,
  plantId: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  createdAt: Schema.DateFromString,
})

// Notifications list response - uses standard pagination format
export const NotificationsListResponse = PaginatedResponse(Notification)
export type NotificationsListResponse = typeof NotificationsListResponse.Type

// Filter type extending status with 'all'
export const NotificationStatusFilter = Schema.Union([
  NotificationStatus,
  Schema.Literal('all'),
])
export type NotificationStatusFilter = typeof NotificationStatusFilter.Type

// Unread count response
export const UnreadCountResponse = Schema.Struct({
  count: Schema.Number,
})
export type UnreadCountResponse = typeof UnreadCountResponse.Type

// Type exports
export type Notification = typeof Notification.Type
