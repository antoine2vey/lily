import type { SqlError } from '@effect/sql/SqlError'
import { KnowledgeDrizzle, rawDocuments } from '@lily/knowledge-db'
import type { RawDocument } from '@lily/shared/knowledge'
import { count, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

type RawDocumentRow = typeof rawDocuments.$inferSelect

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
  sourceUrl: Option.getOrUndefined(Option.fromNullable(row.sourceUrl)),
  sourceId: Option.getOrUndefined(Option.fromNullable(row.sourceId)),
  title: row.title,
  content: row.content,
  author: Option.getOrUndefined(Option.fromNullable(row.author)),
  score: Option.getOrUndefined(Option.fromNullable(row.score)),
  metadata: Option.getOrUndefined(Option.fromNullable(row.metadata)),
  ingestJobId: row.ingestJobId,
  fetchedAt: row.fetchedAt,
})

export interface IRawDocumentRepository {
  readonly create: (
    data: CreateRawDocumentData
  ) => Effect.Effect<RawDocument, SqlError>
  readonly findBySourceId: (
    sourceId: string
  ) => Effect.Effect<RawDocument | null, SqlError>
  readonly countByJobId: (jobId: string) => Effect.Effect<number, SqlError>
}

export class RawDocumentRepository extends Context.Tag('RawDocumentRepository')<
  RawDocumentRepository,
  IRawDocumentRepository
>() {}

export const RawDocumentRepositoryLive = Layer.effect(
  RawDocumentRepository,
  Effect.gen(function* () {
    const db = yield* KnowledgeDrizzle

    return {
      create: Effect.fn('RawDocumentRepository.create')(function* (
        data: CreateRawDocumentData
      ) {
        const rows = yield* db.insert(rawDocuments).values(data).returning()

        return pipe(
          Array.head(rows),
          Option.map(mapToRawDocument),
          Option.getOrThrow
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
