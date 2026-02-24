import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import { ProcessedChunkRepository } from '@lily/api/repositories/processed-chunk.repository'
import { Array, Effect, pipe } from 'effect'
import type { UnknownException } from 'effect/Cause'

export interface KnowledgeStatsResult {
  readonly totalChunks: number
  readonly totalDocuments: number
  readonly totalJobs: number
  readonly sourceBreakdown: readonly { source: string; count: number }[]
}

export const getKnowledgeStats: Effect.Effect<
  KnowledgeStatsResult,
  UnknownException,
  IngestJobRepository | ProcessedChunkRepository
> = Effect.gen(function* () {
  const jobRepo = yield* IngestJobRepository
  const chunkRepo = yield* ProcessedChunkRepository

  const totalChunks = yield* chunkRepo.count()
  const totalJobs = yield* jobRepo.count()
  const sourceBreakdown = yield* chunkRepo.countBySource()

  const totalDocuments = pipe(
    sourceBreakdown,
    Array.reduce(0, (acc, s) => acc + s.count)
  )

  return {
    totalChunks,
    totalDocuments,
    totalJobs,
    sourceBreakdown,
  }
}).pipe(Effect.withSpan('KnowledgeIngestion.getKnowledgeStats'))
