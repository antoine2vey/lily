import { mockIngestJobs } from '@lily/api/__tests__/fixtures/knowledge'
import { createMockIngestJobRepository } from '@lily/api/__tests__/mocks/ingest-job.repository'
import { getIngestJob } from '@lily/api/services/knowledge-ingestion/endpoints/get-ingest-job'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getIngestJob', () => {
  it('should return job when found', async () => {
    const result = await Effect.runPromise(
      getIngestJob('job-1').pipe(
        Effect.provide(
          createMockIngestJobRepository({ jobs: [...mockIngestJobs] })
        )
      )
    )

    expect(result.id).toBe('job-1')
    expect(result.adapter).toBe('reddit')
    expect(result.status).toBe('completed')
  })

  it('should fail with IngestJobNotFoundError when not found', async () => {
    const exit = await Effect.runPromiseExit(
      getIngestJob('non-existent').pipe(
        Effect.provide(
          createMockIngestJobRepository({ jobs: [...mockIngestJobs] })
        )
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('IngestJobNotFoundError')
    }
  })

  it('should return the correct job by id', async () => {
    const result = await Effect.runPromise(
      getIngestJob('job-3').pipe(
        Effect.provide(
          createMockIngestJobRepository({ jobs: [...mockIngestJobs] })
        )
      )
    )

    expect(result.id).toBe('job-3')
    expect(result.status).toBe('failed')
    expect(result.error).toBe('Connection timeout')
  })
})
