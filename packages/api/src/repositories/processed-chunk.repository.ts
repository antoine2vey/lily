import {
  KnowledgeDrizzle,
  processedChunks,
  rawDocuments,
} from '@lily/knowledge-db'
import type { ChunkSearchResult, ContentCategory } from '@lily/shared/knowledge'
import { count, eq, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { UnknownException } from 'effect/Cause'

export interface CreateProcessedChunkData {
  documentId: string
  content: string
  chunkIndex: number
  source: string
  plantType?: string | undefined
  category?: ContentCategory | undefined
  plantMentions?: string[] | undefined
  metadata?: Record<string, unknown> | undefined
  embedding?: number[] | undefined
}

export interface SearchChunksParams {
  embedding: number[]
  plantType?: string | undefined
  limit?: number | undefined
  minSimilarity?: number | undefined
}

interface SearchRow {
  id: string
  content: string
  source: string
  sourceUrl: string | null
  plantType: string | null
  category: ContentCategory | null
  metadata: Record<string, unknown> | null
  similarity: number
}

export interface IProcessedChunkRepository {
  readonly create: (
    data: CreateProcessedChunkData
  ) => Effect.Effect<void, UnknownException>
  readonly createMany: (
    chunks: CreateProcessedChunkData[]
  ) => Effect.Effect<void, UnknownException>
  readonly search: (
    params: SearchChunksParams
  ) => Effect.Effect<ChunkSearchResult[], UnknownException>
  readonly count: () => Effect.Effect<number, UnknownException>
  readonly countBySource: () => Effect.Effect<
    { source: string; count: number }[],
    UnknownException
  >
  readonly countByJobId: (
    jobId: string
  ) => Effect.Effect<number, UnknownException>
}

export class ProcessedChunkRepository extends Context.Tag(
  'ProcessedChunkRepository'
)<ProcessedChunkRepository, IProcessedChunkRepository>() {}

export const ProcessedChunkRepositoryLive = Layer.effect(
  ProcessedChunkRepository,
  Effect.gen(function* () {
    const db = yield* KnowledgeDrizzle

    return {
      create: (data: CreateProcessedChunkData) =>
        Effect.gen(function* () {
          yield* Effect.tryPromise(() =>
            db.insert(processedChunks).values({
              ...data,
              plantMentions: Option.getOrNull(
                Option.fromNullable(data.plantMentions)
              ),
              embedding: Option.getOrNull(Option.fromNullable(data.embedding)),
            })
          )
        }).pipe(Effect.withSpan('ProcessedChunkRepository.create')),

      createMany: (chunks: CreateProcessedChunkData[]) =>
        Effect.gen(function* () {
          if (Array.isEmptyArray(chunks)) {
            return
          }

          const values = Array.map(chunks, (chunk) => ({
            ...chunk,
            plantMentions: Option.getOrNull(
              Option.fromNullable(chunk.plantMentions)
            ),
            metadata: Option.getOrNull(Option.fromNullable(chunk.metadata)),
            embedding: Option.getOrNull(Option.fromNullable(chunk.embedding)),
          }))

          yield* Effect.tryPromise(() =>
            db.insert(processedChunks).values(values)
          )
        }).pipe(Effect.withSpan('ProcessedChunkRepository.createMany')),

      search: (params: SearchChunksParams) =>
        Effect.gen(function* () {
          const limit = Option.getOrElse(
            Option.fromNullable(params.limit),
            () => 5
          )
          const vectorStr = `[${params.embedding.join(',')}]`

          const plantTypeCondition = pipe(
            Option.fromNullable(params.plantType),
            Option.match({
              onNone: () => sql`TRUE`,
              onSome: (pt) => sql`${processedChunks.plantType} = ${pt}`,
            })
          )

          const results = (yield* Effect.tryPromise(() =>
            db
              .select({
                id: processedChunks.id,
                content: processedChunks.content,
                source: processedChunks.source,
                sourceUrl: rawDocuments.sourceUrl,
                plantType: processedChunks.plantType,
                category: processedChunks.category,
                metadata: sql<Record<
                  string,
                  unknown
                > | null>`processed_chunks.metadata`,
                similarity: sql<number>`1 - (${processedChunks.embedding} <=> ${vectorStr}::vector)`,
              })
              .from(processedChunks)
              .innerJoin(
                rawDocuments,
                eq(processedChunks.documentId, rawDocuments.id)
              )
              .where(plantTypeCondition)
              .orderBy(
                sql`${processedChunks.embedding} <=> ${vectorStr}::vector`
              )
              .limit(limit)
          )) as SearchRow[]

          const threshold = Option.getOrElse(
            Option.fromNullable(params.minSimilarity),
            () => 0.5
          )

          return pipe(
            Array.filter(results, (r) => r.similarity > threshold),
            Array.map(
              (r): ChunkSearchResult => ({
                id: r.id,
                content: r.content,
                source: r.source,
                sourceUrl: Option.getOrUndefined(
                  Option.fromNullable(r.sourceUrl)
                ),
                plantType: Option.getOrUndefined(
                  Option.fromNullable(r.plantType)
                ),
                category: Option.getOrUndefined(
                  Option.fromNullable(r.category)
                ) as ContentCategory | undefined,
                metadata: Option.getOrUndefined(
                  Option.fromNullable(r.metadata)
                ),
                similarity: r.similarity,
              })
            )
          )
        }).pipe(Effect.withSpan('ProcessedChunkRepository.search')),

      count: () =>
        Effect.gen(function* () {
          const result = (yield* Effect.tryPromise(() =>
            db.select({ value: count() }).from(processedChunks)
          )) as { value: number }[]

          return pipe(
            Array.head(result),
            Option.map((r) => r.value),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('ProcessedChunkRepository.count')),

      countBySource: () =>
        Effect.gen(function* () {
          const results = (yield* Effect.tryPromise(() =>
            db
              .select({
                source: processedChunks.source,
                count: count(),
              })
              .from(processedChunks)
              .groupBy(processedChunks.source)
          )) as { source: string; count: number }[]

          return results
        }).pipe(Effect.withSpan('ProcessedChunkRepository.countBySource')),

      countByJobId: (jobId: string) =>
        Effect.gen(function* () {
          const result = (yield* Effect.tryPromise(() =>
            db
              .select({ value: count() })
              .from(processedChunks)
              .innerJoin(
                rawDocuments,
                eq(processedChunks.documentId, rawDocuments.id)
              )
              .where(eq(rawDocuments.ingestJobId, jobId))
          )) as { value: number }[]

          return pipe(
            Array.head(result),
            Option.map((r) => r.value),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('ProcessedChunkRepository.countByJobId')),
    }
  })
)
