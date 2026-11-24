import { KnowledgeDrizzle, processedChunks } from '@lily/knowledge-db'
import { type ChunkSearchResult, ContentCategory } from '@lily/shared/knowledge'
import { count, eq, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe, Schema } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'
import { queryRows } from './helpers/raw-query'

export interface SearchChunksParams {
  embedding: number[]
  queryText: string
  limit?: number | undefined
  /** Filters the vector candidates only. A full-text match below it still returns. */
  minSimilarity?: number | undefined
}

const SearchRow = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  source: Schema.String,
  source_url: Schema.NullOr(Schema.String),
  plant_type: Schema.NullOr(Schema.String),
  category: Schema.NullOr(ContentCategory),
  metadata: Schema.Unknown,
  similarity: Schema.Finite,
})

const UnembeddedChunkRow = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
})

/** A chunk search cannot return yet, with the text its embedding is made from. */
export type UnembeddedChunk = typeof UnembeddedChunkRow.Type

export interface IProcessedChunkRepository {
  readonly search: (
    params: SearchChunksParams
  ) => Effect.Effect<ChunkSearchResult[], SqlError>
  readonly count: Effect.Effect<number, SqlError>
  readonly countBySource: Effect.Effect<
    { source: string; count: number }[],
    SqlError
  >
  /**
   * Up to `limit` chunks that should have an embedding and have none. A
   * parent chunk has none on purpose and is left out: a parent is a chunk
   * another chunk names in `parent_chunk_id`. The order is random, so a chunk
   * the model always rejects cannot keep the others from being returned.
   */
  readonly findUnembedded: (
    limit: number
  ) => Effect.Effect<ReadonlyArray<UnembeddedChunk>, SqlError>
  readonly setEmbedding: (
    id: string,
    embedding: number[]
  ) => Effect.Effect<void, SqlError>
}

export class ProcessedChunkRepository extends Context.Service<
  ProcessedChunkRepository,
  IProcessedChunkRepository
>()('ProcessedChunkRepository') {}

const toUndefined = <T>(value: T | null): T | undefined =>
  Option.getOrUndefined(Option.fromNullishOr(value))

export const ProcessedChunkRepositoryLive = Layer.effect(
  ProcessedChunkRepository,
  Effect.gen(function* () {
    const db = yield* KnowledgeDrizzle

    return {
      search: Effect.fn('ProcessedChunkRepository.search')(function* (
        params: SearchChunksParams
      ) {
        const limit = Option.getOrElse(
          Option.fromNullishOr(params.limit),
          () => 5
        )
        const threshold = Option.getOrElse(
          Option.fromNullishOr(params.minSimilarity),
          () => 0.5
        )
        const distanceThreshold = 1 - threshold
        const candidateLimit = Math.max(limit * 10, 50)
        const vectorStr = `'[${params.embedding.join(',')}]'`

        const distanceThresholdRaw = sql.raw(String(distanceThreshold))
        const candidateLimitRaw = sql.raw(String(candidateLimit))
        const limitRaw = sql.raw(String(limit))

        const rows = yield* db
          .execute(sql`

              WITH fts_query AS (
                SELECT plainto_tsquery('english', ${params.queryText}) AS q
              ),
              vector_candidates AS (
                SELECT id,
                       (embedding <=> ${sql.raw(vectorStr)}::halfvec) AS vdist,
                       RANK() OVER (ORDER BY embedding <=> ${sql.raw(vectorStr)}::halfvec) AS vrank
                FROM processed_chunks
                WHERE embedding IS NOT NULL
                  AND (embedding <=> ${sql.raw(vectorStr)}::halfvec) < ${distanceThresholdRaw}
                ORDER BY embedding <=> ${sql.raw(vectorStr)}::halfvec
                LIMIT ${candidateLimitRaw}
              ),
              fts_candidates AS (
                SELECT processed_chunks.id,
                       RANK() OVER (ORDER BY ts_rank(search_vector, fts_query.q) DESC) AS frank
                FROM processed_chunks, fts_query
                WHERE search_vector @@ fts_query.q
                ORDER BY ts_rank(search_vector, fts_query.q) DESC
                LIMIT ${candidateLimitRaw}
              ),
              fused AS (
                SELECT
                  COALESCE(v.id, f.id) AS id,
                  COALESCE(1.0 / (60.0 + v.vrank), 0) + COALESCE(1.0 / (60.0 + f.frank), 0) AS rrf_score
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
                  1.0 - (pc.embedding <=> ${sql.raw(vectorStr)}::halfvec) AS vector_similarity,
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
              ORDER BY rrf_score DESC, vector_similarity DESC LIMIT ${limitRaw}
            `)
          .pipe(queryRows(SearchRow))

        return Array.map(
          rows,
          (r): ChunkSearchResult => ({
            id: r.id,
            content: r.content,
            source: r.source,
            sourceUrl: toUndefined(r.source_url),
            plantType: toUndefined(r.plant_type),
            category: toUndefined(r.category),
            metadata: toUndefined(r.metadata),
            similarity: r.similarity,
          })
        )
      }),

      count: Effect.suspend(() =>
        db.select({ value: count() }).from(processedChunks)
      ).pipe(
        Effect.map((result) =>
          pipe(
            Array.head(result),
            Option.map((r) => r.value),
            Option.getOrElse(() => 0)
          )
        ),
        Effect.withSpan('ProcessedChunkRepository.count')
      ),

      countBySource: Effect.suspend(() =>
        db
          .select({
            source: processedChunks.source,
            count: count(),
          })
          .from(processedChunks)
          .groupBy(processedChunks.source)
      ).pipe(Effect.withSpan('ProcessedChunkRepository.countBySource')),

      findUnembedded: Effect.fn('ProcessedChunkRepository.findUnembedded')(
        function* (limit: number) {
          return yield* db
            .execute(sql`
            SELECT pc.id, COALESCE(pc.embedding_content, pc.content) AS text
            FROM processed_chunks pc
            WHERE pc.embedding IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM processed_chunks child
                WHERE child.parent_chunk_id = pc.id
              )
            ORDER BY random()
            LIMIT ${limit}
          `)
            .pipe(queryRows(UnembeddedChunkRow))
        }
      ),

      setEmbedding: Effect.fn('ProcessedChunkRepository.setEmbedding')(
        function* (id: string, embedding: number[]) {
          yield* db
            .update(processedChunks)
            .set({ embedding })
            .where(eq(processedChunks.id, id))
        }
      ),
    }
  })
)
