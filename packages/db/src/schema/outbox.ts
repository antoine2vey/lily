import { sql } from 'drizzle-orm'
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

/**
 * Transactional outbox, shared by every context. A producer appends rows in
 * the same transaction as its writes; the relay delivers each row to every
 * consumer named in `pending_consumers` and removes a name on success. A row
 * is done when `processed_at` is set: delivered to all, or dead-lettered.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    topic: text('topic').notNull(),
    event: jsonb('event').notNull(),
    pendingConsumers: text('pending_consumers').array().notNull(),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    claimedUntil: timestamp('claimed_until', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    index('outbox_ready_idx')
      .on(t.availableAt, t.id)
      .where(sql`processed_at IS NULL`),
  ]
)
