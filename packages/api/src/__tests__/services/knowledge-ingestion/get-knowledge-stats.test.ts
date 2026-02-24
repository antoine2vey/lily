import { mockIngestJobs } from '@lily/api/__tests__/fixtures/knowledge'
import { createMockIngestJobRepository } from '@lily/api/__tests__/mocks/ingest-job.repository'
import { createMockProcessedChunkRepository } from '@lily/api/__tests__/mocks/processed-chunk.repository'
import { getKnowledgeStats } from '@lily/api/services/knowledge-ingestion/endpoints/get-knowledge-stats'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getKnowledgeStats', () => {
  it('should return aggregated stats', async () => {
    const sourceBreakdown = [
      { source: 'reddit', count: 25 },
      { source: 'web', count: 10 },
    ]

    const layer = Layer.merge(
      createMockIngestJobRepository({ jobs: [...mockIngestJobs] }),
      createMockProcessedChunkRepository({
        insertedChunks: [],
        sourceBreakdown,
      })
    )

    const result = await Effect.runPromise(
      getKnowledgeStats.pipe(Effect.provide(layer))
    )

    expect(result.totalJobs).toBe(3)
    expect(result.sourceBreakdown).toEqual(sourceBreakdown)
  })

  it('should calculate totalDocuments from source breakdown', async () => {
    const sourceBreakdown = [
      { source: 'reddit', count: 15 },
      { source: 'web', count: 8 },
      { source: 'file', count: 3 },
    ]

    const layer = Layer.merge(
      createMockIngestJobRepository({ jobs: [...mockIngestJobs] }),
      createMockProcessedChunkRepository({
        insertedChunks: [],
        sourceBreakdown,
      })
    )

    const result = await Effect.runPromise(
      getKnowledgeStats.pipe(Effect.provide(layer))
    )

    expect(result.totalDocuments).toBe(26)
  })

  it('should return zero counts when empty', async () => {
    const layer = Layer.merge(
      createMockIngestJobRepository({ jobs: [] }),
      createMockProcessedChunkRepository({
        insertedChunks: [],
        sourceBreakdown: [],
      })
    )

    const result = await Effect.runPromise(
      getKnowledgeStats.pipe(Effect.provide(layer))
    )

    expect(result.totalChunks).toBe(0)
    expect(result.totalDocuments).toBe(0)
    expect(result.totalJobs).toBe(0)
    expect(result.sourceBreakdown).toEqual([])
  })
})
