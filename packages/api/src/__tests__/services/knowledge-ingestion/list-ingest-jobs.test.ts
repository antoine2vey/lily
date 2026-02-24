import { mockIngestJobs } from '@lily/api/__tests__/fixtures/knowledge'
import { createMockIngestJobRepository } from '@lily/api/__tests__/mocks/ingest-job.repository'
import { listIngestJobs } from '@lily/api/services/knowledge-ingestion/endpoints/list-ingest-jobs'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('listIngestJobs', () => {
  it('should return all jobs', async () => {
    const result = await Effect.runPromise(
      listIngestJobs.pipe(
        Effect.provide(
          createMockIngestJobRepository({ jobs: [...mockIngestJobs] })
        )
      )
    )

    expect(result).toHaveLength(3)
  })

  it('should return empty array when no jobs exist', async () => {
    const result = await Effect.runPromise(
      listIngestJobs.pipe(
        Effect.provide(createMockIngestJobRepository({ jobs: [] }))
      )
    )

    expect(result).toEqual([])
  })
})
