import type { SqlError } from '@effect/sql/SqlError'
import {
  KnowledgeDrizzle,
  processedChunks,
  rawDocuments,
} from '@lily/knowledge-db'
import type { ChunkSearchResult, ContentCategory } from '@lily/shared/knowledge'
import { count, eq, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

export interface CreateProcessedChunkData {
  id?: string | undefined
  documentId: string
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

export interface SearchChunksParams {
  embedding: number[]
  queryText: string
  plantType?: string | undefined
  limit?: number | undefined
  minSimilarity?: number | undefined
}

interface SearchRow {
  id: string
  content: string
  source: string
  source_url: string | null
  plant_type: string | null
  category: ContentCategory | null
  metadata: Record<string, unknown> | null
  similarity: string | number
}

export interface IProcessedChunkRepository {
  readonly create: (
    data: CreateProcessedChunkData
  ) => Effect.Effect<void, SqlError>
  readonly createMany: (
    chunks: CreateProcessedChunkData[]
  ) => Effect.Effect<void, SqlError>
  readonly search: (
    params: SearchChunksParams
  ) => Effect.Effect<ChunkSearchResult[], SqlError>
  readonly count: () => Effect.Effect<number, SqlError>
  readonly countBySource: () => Effect.Effect<
    { source: string; count: number }[],
    SqlError
  >
  readonly countByJobId: (jobId: string) => Effect.Effect<number, SqlError>
}

export class ProcessedChunkRepository extends Context.Tag(
  'ProcessedChunkRepository'
)<ProcessedChunkRepository, IProcessedChunkRepository>() {}

const toNull = <T>(value: T | undefined): T | null =>
  Option.getOrNull(Option.fromNullable(value))

const toUndefined = <T>(value: T | null): T | undefined =>
  Option.getOrUndefined(Option.fromNullable(value))

const toInsertValues = (chunk: CreateProcessedChunkData) => ({
  ...chunk,
  embeddingContent: toNull(chunk.embeddingContent),
  plantMentions: toNull(chunk.plantMentions),
  metadata: toNull(chunk.metadata),
  embedding: toNull(chunk.embedding),
})

export const ProcessedChunkRepositoryLive = Layer.effect(
  ProcessedChunkRepository,
  Effect.gen(function* () {
    const db = yield* KnowledgeDrizzle

    return {
      create: (data: CreateProcessedChunkData) =>
        db
          .insert(processedChunks)
          .values(toInsertValues(data))
          .pipe(
            Effect.asVoid,
            Effect.withSpan('ProcessedChunkRepository.create')
          ),

      createMany: (chunks: CreateProcessedChunkData[]) =>
        Effect.gen(function* () {
          if (Array.isEmptyArray(chunks)) {
            return
          }

          yield* db
            .insert(processedChunks)
            .values(Array.map(chunks, toInsertValues))
        }).pipe(Effect.withSpan('ProcessedChunkRepository.createMany')),

      search: (params: SearchChunksParams) =>
        Effect.gen(function* () {
          const limit = Option.getOrElse(
            Option.fromNullable(params.limit),
            () => 5
          )
          const threshold = Option.getOrElse(
            Option.fromNullable(params.minSimilarity),
            () => 0.5
          )
          const distanceThreshold = 1 - threshold
          const candidateLimit = Math.max(limit * 10, 50)
          const vectorStr = `'[${params.embedding.join(',')}]'`

          const plantTypeCondition = pipe(
            Option.fromNullable(params.plantType),
            Option.match({
              onNone: () => sql``,
              onSome: (pt) => sql`AND plant_type = ${pt}`,
            })
          )

          const distanceThresholdRaw = sql.raw(String(distanceThreshold))
          const similarityThresholdRaw = sql.raw(String(threshold))
          const candidateLimitRaw = sql.raw(String(candidateLimit))
          const limitRaw = sql.raw(String(limit))

          const rawRows = yield* db
            .execute(sql`

              WITH fts_query AS (
                SELECT plainto_tsquery('english', ${params.queryText}) AS q
              ),
              vector_candidates AS (
                SELECT id,
                       (embedding <=> ${sql.raw(vectorStr)}::vector) AS vdist,
                       RANK() OVER (ORDER BY embedding <=> ${sql.raw(vectorStr)}::vector) AS vrank
                FROM processed_chunks
                WHERE embedding IS NOT NULL
                  AND (embedding <=> ${sql.raw(vectorStr)}::vector) < ${distanceThresholdRaw}
                  ${plantTypeCondition}
                ORDER BY embedding <=> ${sql.raw(vectorStr)}::vector
                LIMIT ${candidateLimitRaw}
              ),
              fts_candidates AS (
                SELECT processed_chunks.id,
                       RANK() OVER (ORDER BY ts_rank(search_vector, fts_query.q) DESC) AS frank
                FROM processed_chunks, fts_query
                WHERE search_vector @@ fts_query.q
                  ${plantTypeCondition}
                ORDER BY ts_rank(search_vector, fts_query.q) DESC
                LIMIT ${candidateLimitRaw}
              ),
              fused AS (
                SELECT
                  COALESCE(v.id, f.id) AS id,
                  COALESCE(1.0 / (60.0 + v.vrank), 0) + COALESCE(1.0 / (60.0 + f.frank), 0) AS rrf_score,
                  v.vdist
                FROM vector_candidates v
                FULL OUTER JOIN fts_candidates f ON v.id = f.id
              ),
              ranked AS (
                SELECT
                  pc.id,
                  COALESCE(parent.content, pc.content) AS content,
                  pc.source,
                  rd.source_url,
                  pc.plant_type,
                  pc.category,
                  pc.metadata,
                  fused.rrf_score,
                  COALESCE(1.0 - fused.vdist, 0.0) AS vector_similarity,
                  COALESCE(pc.parent_chunk_id, pc.id) AS dedup_key
                FROM fused
                JOIN processed_chunks pc ON pc.id = fused.id AND pc.embedding IS NOT NULL
                LEFT JOIN processed_chunks parent ON parent.id = pc.parent_chunk_id
                LEFT JOIN raw_documents rd ON rd.id = pc.document_id
              ),
              deduped AS (
                SELECT DISTINCT ON (dedup_key)
                  id, content, source, source_url, plant_type, category, metadata, rrf_score, vector_similarity
                FROM ranked
                ORDER BY dedup_key, rrf_score DESC
              )
              SELECT id, content, source, source_url, plant_type, category, metadata,
                     vector_similarity AS similarity
              FROM deduped
              WHERE vector_similarity >= ${similarityThresholdRaw}
              ORDER BY rrf_score DESC LIMIT ${limitRaw}
            `)
            .pipe(
              Effect.tapError((e) => {
                const err = e as unknown as {
                  cause?: {
                    code?: string
                    message?: string
                    detail?: string
                    hint?: string
                  }
                }
                const pgCode = err?.cause?.code ?? 'unknown'
                const pgMessage = err?.cause?.message ?? String(e)
                return Effect.logError(`[search] PG ${pgCode}: ${pgMessage}`, {
                  detail: err?.cause?.detail,
                  hint: err?.cause?.hint,
                })
              })
            )

          return Array.map(
            rawRows as unknown as SearchRow[],
            (r): ChunkSearchResult => ({
              id: r.id,
              content: r.content,
              source: r.source,
              sourceUrl: toUndefined(r.source_url),
              plantType: toUndefined(r.plant_type),
              category: toUndefined(r.category) as ContentCategory | undefined,
              metadata: toUndefined(r.metadata),
              similarity: Number(r.similarity),
            })
          )
        }).pipe(Effect.withSpan('ProcessedChunkRepository.search')),

      count: () =>
        db
          .select({ value: count() })
          .from(processedChunks)
          .pipe(
            Effect.map((result) =>
              pipe(
                Array.head(result),
                Option.map((r) => r.value),
                Option.getOrElse(() => 0)
              )
            ),
            Effect.withSpan('ProcessedChunkRepository.count')
          ),

      countBySource: () =>
        db
          .select({
            source: processedChunks.source,
            count: count(),
          })
          .from(processedChunks)
          .groupBy(processedChunks.source)
          .pipe(Effect.withSpan('ProcessedChunkRepository.countBySource')),

      countByJobId: (jobId: string) =>
        db
          .select({ value: count() })
          .from(processedChunks)
          .innerJoin(
            rawDocuments,
            eq(processedChunks.documentId, rawDocuments.id)
          )
          .where(eq(rawDocuments.ingestJobId, jobId))
          .pipe(
            Effect.map((result) =>
              pipe(
                Array.head(result),
                Option.map((r) => r.value),
                Option.getOrElse(() => 0)
              )
            ),
            Effect.withSpan('ProcessedChunkRepository.countByJobId')
          ),
    }
  })
)
