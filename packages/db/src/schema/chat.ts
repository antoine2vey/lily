import { diagnoses } from '@lily/db/schema/diagnoses'
import { plants } from '@lily/db/schema/plants'
import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: text('message_id'), // AI SDK's UIMessage.id for deduplication
  role: text('role').notNull(),
  content: text('content').notNull(),
  parts: jsonb('parts'), // UIMessage.parts array (text, tool-call, etc.)
  imageUrl: text('image_url'),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const chatMessagesRelations = relations(
  chatMessages,
  ({ one, many }) => ({
    user: one(users, {
      fields: [chatMessages.userId],
      references: [users.id],
    }),
    plant: one(plants, {
      fields: [chatMessages.plantId],
      references: [plants.id],
    }),
    diagnoses: many(diagnoses),
  })
)
