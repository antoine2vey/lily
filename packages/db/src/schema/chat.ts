import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { plants } from './plants'
import { users } from './users'

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
  plant: one(plants, {
    fields: [chatMessages.plantId],
    references: [plants.id],
  }),
}))
