import { relations } from 'drizzle-orm'
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { plants } from './plants'
import { users } from './users'

export const deadLetterMessages = pgTable('dead_letter_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalMessageId: text('original_message_id').notNull(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').notNull(),
  error: text('error').notNull(),
  retryCount: integer('retry_count').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  failedAt: timestamp('failed_at').notNull().defaultNow(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  plantId: uuid('plant_id').references(() => plants.id, {
    onDelete: 'set null',
  }),
})

export const deadLetterMessagesRelations = relations(
  deadLetterMessages,
  ({ one }) => ({
    user: one(users, {
      fields: [deadLetterMessages.userId],
      references: [users.id],
    }),
    plant: one(plants, {
      fields: [deadLetterMessages.plantId],
      references: [plants.id],
    }),
  })
)
