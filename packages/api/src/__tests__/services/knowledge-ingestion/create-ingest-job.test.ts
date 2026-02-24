import { createMockIngestJobRepository } from '@lily/api/__tests__/mocks/ingest-job.repository'
import { createIngestJob } from '@lily/api/services/knowledge-ingestion/endpoints/create-ingest-job'
import type { IngestJob } from '@lily/shared/knowledge'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('createIngestJob', () => {
  it('should create a job and return it with pending status', async () => {
    const jobs: IngestJob[] = []

    const result = await Effect.runPromise(
      createIngestJob('reddit', {
        type: 'reddit',
        subreddits: ['houseplants'],
        limit: 10,
      }).pipe(Effect.provide(createMockIngestJobRepository({ jobs })))
    )

    expect(result.adapter).toBe('reddit')
    expect(result.status).toBe('pending')
    expect(result.documentsFetched).toBe(0)
    expect(result.chunksCreated).toBe(0)
    expect(result.id).toBeDefined()
  })

  it('should store the job in the repository', async () => {
    const jobs: IngestJob[] = []

    await Effect.runPromise(
      createIngestJob('web', {
        type: 'web',
        urls: ['https://example.com'],
      }).pipe(Effect.provide(createMockIngestJobRepository({ jobs })))
    )

    expect(jobs).toHaveLength(1)
    expect(jobs[0].adapter).toBe('web')
  })
})
