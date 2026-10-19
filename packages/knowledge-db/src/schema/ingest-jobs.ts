import { ingestJobStatusEnum } from '@lily/knowledge-db/schema/enums'
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const ingestJobs = pgTable('ingest_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  adapter: text('adapter').notNull(),
  config: jsonb('config').notNull(),
  status: ingestJobStatusEnum('status').notNull().default('pending'),
  documentsFetched: integer('documents_fetched').notNull().default(0),
  chunksCreated: integer('chunks_created').notNull().default(0),
  cursor: text('cursor'),
  error: text('error'),
  // Set when a worker takes the job, refreshed after every document. The
  // worker re-queues in_progress jobs whose claim is older than its timeout.
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
