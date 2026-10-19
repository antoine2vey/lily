import { ingestJobs } from '@lily/knowledge-db/schema/ingest-jobs'
import { relations, sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const rawDocuments = pgTable(
  'raw_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    sourceId: text('source_id'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    author: text('author'),
    score: integer('score'),
    metadata: jsonb('metadata'),
    ingestJobId: uuid('ingest_job_id')
      .notNull()
      .references(() => ingestJobs.id, { onDelete: 'cascade' }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('raw_documents_source_id_idx').on(table.sourceId),
    index('raw_documents_ingest_job_id_idx').on(table.ingestJobId),
    // Rows older than the cutoff may repeat a source_id. In production the
    // cutoff is the moment migration 0005 ran (see that file).
    uniqueIndex('raw_documents_source_id_unique')
      .on(table.sourceId)
      .where(
        sql`${table.sourceId} IS NOT NULL AND ${table.fetchedAt} >= '2026-10-19 00:00:00+00'`
      ),
  ]
)

export const rawDocumentsRelations = relations(rawDocuments, ({ one }) => ({
  ingestJob: one(ingestJobs, {
    fields: [rawDocuments.ingestJobId],
    references: [ingestJobs.id],
  }),
}))
