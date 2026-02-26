import { contentCategoryEnum } from '@lily/knowledge-db/schema/enums'
import { rawDocuments } from '@lily/knowledge-db/schema/raw-documents'
import { relations } from 'drizzle-orm'
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const vector = customType<{
  data: number[]
  driverParam: string
}>({
  dataType: () => 'vector(3072)',
  toDriver: (value) => `[${value.join(',')}]`,
  fromDriver: (value) => {
    const str = value as string
    return str.slice(1, -1).split(',').map(Number)
  },
})

export const processedChunks = pgTable(
  'processed_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => rawDocuments.id, { onDelete: 'cascade' }),
    parentChunkId: uuid('parent_chunk_id').references(
      () => processedChunks.id,
      { onDelete: 'cascade' }
    ),
    content: text('content').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    source: text('source').notNull(),
    plantType: text('plant_type'),
    category: contentCategoryEnum('category'),
    plantMentions: jsonb('plant_mentions').$type<string[]>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    embeddingContent: text('embedding_content'),
    embedding: vector('embedding'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('processed_chunks_document_id_idx').on(table.documentId),
    index('processed_chunks_plant_type_idx').on(table.plantType),
    index('processed_chunks_parent_chunk_id_idx').on(table.parentChunkId),
  ]
)

export const processedChunksRelations = relations(
  processedChunks,
  ({ one, many }) => ({
    document: one(rawDocuments, {
      fields: [processedChunks.documentId],
      references: [rawDocuments.id],
    }),
    parent: one(processedChunks, {
      fields: [processedChunks.parentChunkId],
      references: [processedChunks.id],
      relationName: 'chunk_parent_children',
    }),
    children: many(processedChunks, {
      relationName: 'chunk_parent_children',
    }),
  })
)
