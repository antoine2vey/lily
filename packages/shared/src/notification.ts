import { Schema } from 'effect'

// Notification schemas
export const Notification = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  title: Schema.String,
  body: Schema.String,
  scheduledAt: Schema.Date,
  sentAt: Schema.optional(Schema.Date),
  isRead: Schema.Boolean,
  userId: Schema.String,
  plantId: Schema.optional(Schema.String),
  createdAt: Schema.Date,
})

// Type exports
export type Notification = typeof Notification.Type
