import { KnowledgeDrizzle, rawDocuments } from '@lily/knowledge-db'
import type { RawDocument } from '@lily/shared/knowledge'
import { count, eq } from 'drizzle-orm'
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
   * Inserts the document, or returns null when a row with the same
   * source_id was stored since the caller last looked (the partial unique
   * index `raw_documents_source_id_unique` rejects the insert).
   */
  readonly createIfNew: (
    data: CreateRawDocumentData
  ) => Effect.Effect<RawDocument | null, SqlError>
  readonly findBySourceId: (
    sourceId: string
  ) => Effect.Effect<RawDocument | null, SqlError>
  readonly countByJobId: (jobId: string) => Effect.Effect<number, SqlError>
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
        data: CreateRawDocumentData
      ) {
        const rows = yield* db
          .insert(rawDocuments)
          .values(data)
          .returning()
          .pipe(
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

      countByJobId: Effect.fn('RawDocumentRepository.countByJobId')(function* (
        jobId: string
      ) {
        const result = yield* db
          .select({ value: count() })
          .from(rawDocuments)
          .where(eq(rawDocuments.ingestJobId, jobId))

        return pipe(
          Array.head(result),
          Option.map((r) => r.value),
          Option.getOrElse(() => 0)
        )
      }),
    }
  })
)
