import { KnowledgeDrizzle, rawDocuments } from '@lily/knowledge-db'
import type { RawDocument } from '@lily/shared/knowledge'
import { count, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { UnknownException } from 'effect/Cause'

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
  ) => Effect.Effect<RawDocument, UnknownException>
  readonly findBySourceId: (
    sourceId: string
  ) => Effect.Effect<RawDocument | null, UnknownException>
  readonly countByJobId: (
    jobId: string
  ) => Effect.Effect<number, UnknownException>
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
      create: (data: CreateRawDocumentData) =>
        Effect.gen(function* () {
          const rows = (yield* Effect.tryPromise(() =>
            db.insert(rawDocuments).values(data).returning()
          )) as RawDocumentRow[]

          return pipe(
            Array.head(rows),
            Option.map(mapToRawDocument),
            Option.getOrThrow
          )
        }).pipe(Effect.withSpan('RawDocumentRepository.create')),

      findBySourceId: (sourceId: string) =>
        Effect.gen(function* () {
          const rows = (yield* Effect.tryPromise(() =>
            db
              .select()
              .from(rawDocuments)
              .where(eq(rawDocuments.sourceId, sourceId))
              .limit(1)
          )) as RawDocumentRow[]

          return pipe(
            Array.head(rows),
            Option.map(mapToRawDocument),
            Option.getOrNull
          )
        }).pipe(Effect.withSpan('RawDocumentRepository.findBySourceId')),

      countByJobId: (jobId: string) =>
        Effect.gen(function* () {
          const result = (yield* Effect.tryPromise(() =>
            db
              .select({ value: count() })
              .from(rawDocuments)
              .where(eq(rawDocuments.ingestJobId, jobId))
          )) as { value: number }[]

          return pipe(
            Array.head(result),
            Option.map((r) => r.value),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('RawDocumentRepository.countByJobId')),
    }
  })
)
