import { createTestIngestJob } from '@lily/api/__tests__/fixtures/knowledge'
import { createMockDeadLetterRepository } from '@lily/api/__tests__/mocks/dead-letter.repository'
import {
  createMockIngestJobRepository,
  type MockIngestJob,
} from '@lily/api/__tests__/mocks/ingest-job.repository'
import { createMockProcessedChunkRepository } from '@lily/api/__tests__/mocks/processed-chunk.repository'
import { createMockRawDocumentRepository } from '@lily/api/__tests__/mocks/raw-document.repository'
import { processIngestJob } from '@lily/api/services/knowledge-ingestion/processor'
import {
  CLAIM_TIMEOUT,
  pollIngestJobs,
} from '@lily/api/services/knowledge-ingestion/worker'
import { Array, DateTime, Duration, Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@lily/api/services/knowledge-ingestion/processor', () => ({
  processIngestJob: vi.fn(() => Effect.void),
}))

const mockedProcess = vi.mocked(processIngestJob)

const minutesAgo = (minutes: number) =>
  DateTime.toDateUtc(
    DateTime.subtractDuration(DateTime.nowUnsafe(), Duration.minutes(minutes))
  )

// The processor is mocked; its other repositories are only here for the
// types.
const poll = (jobs: MockIngestJob[]) =>
  Effect.runPromise(
    pollIngestJobs.pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockIngestJobRepository({ jobs }),
          createMockRawDocumentRepository({ documents: [] }),
          createMockProcessedChunkRepository({ insertedChunks: [] }),
          createMockDeadLetterRepository()
        )
      )
    )
  )

const processedIds = () =>
  Array.map(mockedProcess.mock.calls, ([job]) => job.id)

describe('pollIngestJobs', () => {
  beforeEach(() => {
    mockedProcess.mockClear()
  })

  it('claims the oldest pending job, runs it, and reports more work', async () => {
    const jobs: MockIngestJob[] = [
      createTestIngestJob({ id: 'newer', createdAt: minutesAgo(1) }),
      createTestIngestJob({ id: 'older', createdAt: minutesAgo(2) }),
    ]

    const hasMore = await poll(jobs)

    expect(hasMore).toBe(true)
    expect(processedIds()).toEqual(['older'])
    expect(jobs.find((j) => j.id === 'older')?.status).toBe('in_progress')
    expect(jobs.find((j) => j.id === 'newer')?.status).toBe('pending')
  })

  it('does nothing and reports no work when the queue is empty', async () => {
    const jobs: MockIngestJob[] = [
      createTestIngestJob({ id: 'done', status: 'completed' }),
    ]

    const hasMore = await poll(jobs)

    expect(hasMore).toBe(false)
    expect(processedIds()).toEqual([])
  })

  it('re-queues a job whose claim is older than the timeout and runs it', async () => {
    const stale = Duration.toMinutes(CLAIM_TIMEOUT) + 1
    const jobs: MockIngestJob[] = [
      {
        ...createTestIngestJob({ id: 'abandoned', status: 'in_progress' }),
        claimedAt: minutesAgo(stale),
      },
    ]

    const hasMore = await poll(jobs)

    expect(hasMore).toBe(true)
    expect(processedIds()).toEqual(['abandoned'])
  })

  it('re-queues an in_progress job that was never stamped with a claim', async () => {
    const jobs: MockIngestJob[] = [
      createTestIngestJob({ id: 'pre-migration', status: 'in_progress' }),
    ]

    await poll(jobs)

    expect(processedIds()).toEqual(['pre-migration'])
  })

  it('leaves a job whose claim is fresh to the worker holding it', async () => {
    const jobs: MockIngestJob[] = [
      {
        ...createTestIngestJob({
          id: 'running-elsewhere',
          status: 'in_progress',
        }),
        claimedAt: minutesAgo(1),
      },
    ]

    const hasMore = await poll(jobs)

    expect(hasMore).toBe(false)
    expect(processedIds()).toEqual([])
    expect(jobs[0]?.status).toBe('in_progress')
  })
})
