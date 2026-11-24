import {
  KnowledgeDrizzle,
  processedChunks,
  rawDocuments,
} from '@lily/knowledge-db'
import type { ContentCategory, RawDocument } from '@lily/shared/knowledge'
import { eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

type RawDocumentRow = typeof rawDocuments.$inferSelect

const SOURCE_ID_UNIQUE_INDEX = 'raw_documents_source_id_unique'

export interface CreateRawDocumentData {
  source: string
  sourceUrl?: string | undefined
  sourceId?: string | undefined
  title: string
  content: string
  author?: string | undefined
  score?: number | undefined
  metadata?: unknown
  ingestJobId: string
}

export interface CreateChunkData {
  id?: string | undefined
  parentChunkId?: string | undefined
  content: string
  embeddingContent?: string | undefined
  chunkIndex: number
  source: string
  plantType?: string | undefined
  category?: ContentCategory | undefined
  plantMentions?: string[] | undefined
  metadata?: Record<string, unknown> | undefined
  embedding?: number[] | undefined
}

const toNull = <T>(value: T | undefined): T | null =>
  Option.getOrNull(Option.fromNullishOr(value))

const toChunkValues = (documentId: string) => (chunk: CreateChunkData) => ({
  ...chunk,
  documentId,
  embeddingContent: toNull(chunk.embeddingContent),
  plantMentions: toNull(chunk.plantMentions),
  metadata: toNull(chunk.metadata),
  embedding: toNull(chunk.embedding),
})

const mapToRawDocument = (row: RawDocumentRow): RawDocument => ({
  id: row.id,
  source: row.source,
  sourceUrl: Option.getOrUndefined(Option.fromNullishOr(row.sourceUrl)),
  sourceId: Option.getOrUndefined(Option.fromNullishOr(row.sourceId)),
  title: row.title,
  content: row.content,
  author: Option.getOrUndefined(Option.fromNullishOr(row.author)),
  score: Option.getOrUndefined(Option.fromNullishOr(row.score)),
  metadata: Option.getOrUndefined(Option.fromNullishOr(row.metadata)),
  ingestJobId: row.ingestJobId,
  fetchedAt: row.fetchedAt,
})

export interface IRawDocumentRepository {
  /**
   * Inserts the document with its chunks in one statement, so a failure
   * stores neither. Returns null when a row with the same source_id was
   * stored since the caller last looked (the partial unique index
   * `raw_documents_source_id_unique` rejects the insert).
   */
  readonly createIfNew: (
    data: CreateRawDocumentData,
    chunks: ReadonlyArray<CreateChunkData>
  ) => Effect.Effect<RawDocument | null, SqlError>
  readonly findBySourceId: (
    sourceId: string
  ) => Effect.Effect<RawDocument | null, SqlError>
}

export class RawDocumentRepository extends Context.Service<
  RawDocumentRepository,
  IRawDocumentRepository
>()('RawDocumentRepository') {}

export const RawDocumentRepositoryLive = Layer.effect(
  RawDocumentRepository,
  Effect.gen(function* () {
    const db = yield* KnowledgeDrizzle

    return {
      createIfNew: Effect.fn('RawDocumentRepository.createIfNew')(function* (
        data: CreateRawDocumentData,
        chunks: ReadonlyArray<CreateChunkData>
      ) {
        const document = { ...data, id: crypto.randomUUID() }
        const insertDocument = db.insert(rawDocuments).values(document)
        const insert = Array.match(chunks, {
          onEmpty: () => insertDocument.returning(),
          onNonEmpty: (nonEmpty) => {
            const storedDocument = db
              .$with('stored_document')
              .as(insertDocument.returning())
            const storedChunks = db.$with('stored_chunks').as(
              db
                .insert(processedChunks)
                .values(Array.map(nonEmpty, toChunkValues(document.id)))
                .returning({ id: processedChunks.id })
            )
            return db
              .with(storedDocument, storedChunks)
              .select()
              .from(storedDocument)
          },
        })
        const rows = yield* insert.pipe(
          Effect.catchIf(
            (error) =>
              error.reason._tag === 'UniqueViolation' &&
              error.reason.constraint === SOURCE_ID_UNIQUE_INDEX,
            () => Effect.succeed([])
          )
        )

        return pipe(
          Array.head(rows),
          Option.map(mapToRawDocument),
          Option.getOrNull
        )
      }),

      findBySourceId: Effect.fn('RawDocumentRepository.findBySourceId')(
        function* (sourceId: string) {
          const rows = yield* db
            .select()
            .from(rawDocuments)
            .where(eq(rawDocuments.sourceId, sourceId))
            .limit(1)

          return pipe(
            Array.head(rows),
            Option.map(mapToRawDocument),
            Option.getOrNull
          )
        }
      ),
    }
  })
)
