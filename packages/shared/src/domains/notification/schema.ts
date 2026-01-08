import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'

// Notification status enum
export const NotificationStatus = Schema.Union(
  Schema.Literal('pending'),
  Schema.Literal('queued'),
  Schema.Literal('sent'),
  Schema.Literal('failed')
)
export type NotificationStatus = typeof NotificationStatus.Type

// Notification schemas
export const Notification = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  title: Schema.String,
  body: Schema.String,
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

// Type exports
export type Notification = typeof Notification.Type
