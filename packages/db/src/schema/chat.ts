import { plants } from '@lily/db/schema/plants'
import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm/sql'

export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'general' | 'plant'
    plantId: uuid('plant_id').references(() => plants.id, {
      onDelete: 'cascade',
    }),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('chat_conversations_user_recent_idx').on(
      table.userId,
      table.lastMessageAt
    ),
    uniqueIndex('chat_conversations_user_plant_unique')
      .on(table.userId, table.plantId)
      .where(sql`${table.kind} = 'plant'`),
    check(
      'chat_conversations_kind_plant_consistency',
      sql`(${table.kind} = 'plant' AND ${table.plantId} IS NOT NULL) OR (${table.kind} = 'general' AND ${table.plantId} IS NULL)`
    ),
  ]
)

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id'), // AI SDK's UIMessage.id for deduplication
    role: text('role').notNull(),
    content: text('content').notNull(),
    parts: jsonb('parts'), // UIMessage.parts array (text, tool-call, etc.)
    imageKey: text('image_key'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('chat_messages_conversation_idx').on(
      table.conversationId,
      table.createdAt
    ),
  ]
)

export const chatFollowUpSets = pgTable(
  'chat_follow_up_sets',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }),
    claimedUntil: timestamp('claimed_until', { withTimezone: true }),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    followUps: jsonb('follow_ups').notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.plantId] }),
    index('chat_follow_up_sets_requested_idx')
      .on(table.requestedAt)
      .where(sql`${table.requestedAt} IS NOT NULL`),
    index('chat_follow_up_sets_plant_idx').on(table.plantId),
  ]
)

export const chatConversationsRelations = relations(
  chatConversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [chatConversations.userId],
      references: [users.id],
    }),
    plant: one(plants, {
      fields: [chatConversations.plantId],
      references: [plants.id],
    }),
    messages: many(chatMessages),
  })
)

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}))
