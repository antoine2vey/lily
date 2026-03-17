import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'

// Re-export errors for convenient imports
export { NotificationNotFoundError } from './errors'

// Notification status enum
export const NotificationStatus = Schema.Literal(
  'pending',
  'queued',
  'sent',
  'failed'
)
export type NotificationStatus = typeof NotificationStatus.Type

// Notification schemas
export const Notification = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  scheduledAt: Schema.Date,
  sentAt: Schema.optional(Schema.Date),
  isRead: Schema.Boolean,
  status: NotificationStatus,
  retryCount: Schema.Number,
  lastError: Schema.optional(Schema.String),
  userId: Schema.String,
  plantId: Schema.optional(Schema.String),
  createdAt: Schema.Date,
})

// Notifications list response - uses standard pagination format
export const NotificationsListResponse = PaginatedResponse(Notification)
export type NotificationsListResponse = typeof NotificationsListResponse.Type

// Filter type extending status with 'all'
export const NotificationStatusFilter = Schema.Union(
  NotificationStatus,
  Schema.Literal('all')
)
export type NotificationStatusFilter = typeof NotificationStatusFilter.Type

// Type exports
export type Notification = typeof Notification.Type
