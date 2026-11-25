import { plants } from '@lily/db/schema/plants'
import { users } from '@lily/db/schema/users'
import { relations, sql } from 'drizzle-orm'
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/** What `original_message_id` holds for a queue entry whose id cannot be read. */
export const UNKNOWN_MESSAGE_ID = 'unknown'

/**
 * The dead letters a message has at most one of. Two entries without a
 * readable id are two messages, and knowledge ingestion builds its ids from
 * the first characters of a chunk, which two chunks can share. Written with
 * literals, because Postgres matches an `ON CONFLICT` predicate that binds
 * parameters to no partial index.
 */
export const ONE_DEAD_LETTER_PER_MESSAGE = sql.raw(
  `"original_message_id" <> '${UNKNOWN_MESSAGE_ID}' AND "topic" <> 'enrichment.chunk_failed'`
)

export const deadLetterMessages = pgTable(
  'dead_letter_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originalMessageId: text('original_message_id').notNull(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    error: text('error').notNull(),
    retryCount: integer('retry_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    failedAt: timestamp('failed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    plantId: uuid('plant_id').references(() => plants.id, {
      onDelete: 'set null',
    }),
    alertedAt: timestamp('alerted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('dead_letter_messages_message_unique')
      .on(table.originalMessageId)
      .where(ONE_DEAD_LETTER_PER_MESSAGE),
  ]
)

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
