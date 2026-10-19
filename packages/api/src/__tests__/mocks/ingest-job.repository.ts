import {
  type IIngestJobRepository,
  IngestJobRepository,
} from '@lily/api/repositories/ingest-job.repository'
import type { IngestJob } from '@lily/shared/knowledge'
import { Array, Effect, Layer, Option, Order, pipe } from 'effect'

/** The API job shape plus the worker's claim stamp, which the API hides. */
export type MockIngestJob = IngestJob & { claimedAt?: Date | null }

const byCreatedAt = Order.mapInput(
  Order.Date,
  (job: MockIngestJob) => job.createdAt
)

export const createMockIngestJobRepository = (data: {
  jobs: MockIngestJob[]
}): Layer.Layer<IngestJobRepository> => {
  const replace = (id: string, patch: Partial<MockIngestJob>) =>
    pipe(
      Array.findFirstIndex(data.jobs, (j) => j.id === id),
      Option.flatMap((idx) =>
        Option.map(Option.fromNullishOr(data.jobs[idx]), (existing) => {
          const updated: MockIngestJob = {
            ...existing,
            ...patch,
            updatedAt: new Date(),
          }
          data.jobs[idx] = updated
          return updated
        })
      )
    )

  const repo: IIngestJobRepository = {
    create: (adapter: string, config: unknown) => {
      const job: MockIngestJob = {
        id: `job-${crypto.randomUUID()}`,
        adapter,
        config,
        status: 'pending',
        documentsFetched: 0,
        chunksCreated: 0,
        cursor: undefined,
        error: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      data.jobs.push(job)
      return Effect.succeed(job)
    },

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(data.jobs, (j) => j.id === id),
          Option.getOrNull
        )
      ),

    findAll: () => Effect.succeed(data.jobs),

    claimNext: () =>
      Effect.sync(() =>
        pipe(
          Array.filter(data.jobs, (j) => j.status === 'pending'),
          Array.sort(byCreatedAt),
          Array.head,
          Option.flatMap((job) =>
            replace(job.id, { status: 'in_progress', claimedAt: new Date() })
          ),
          Option.getOrNull
        )
      ),

    releaseStaleClaims: (before: Date) =>
      Effect.sync(() => {
        const stale = Array.filter(
          data.jobs,
          (j) =>
            j.status === 'in_progress' &&
            (j.claimedAt == null || j.claimedAt < before)
        )
        Array.forEach(stale, (j) =>
          replace(j.id, { status: 'pending', claimedAt: null })
        )
        return stale.length
      }),

    recordProgress: (id, counts) =>
      Effect.sync(() => {
        replace(id, { ...counts, claimedAt: new Date() })
      }),

    complete: (id, counts) =>
      Effect.sync(() => {
        replace(id, { ...counts, status: 'completed' })
      }),

    updateError: (id: string, error: string) =>
      Effect.sync(() => {
        replace(id, { error, status: 'failed' })
      }),

    count: () => Effect.succeed(data.jobs.length),

    delete: (id: string) =>
      Effect.sync(() =>
        pipe(
          Array.findFirstIndex(data.jobs, (j) => j.id === id),
          Option.map((idx) => {
            data.jobs.splice(idx, 1)
            return true
          }),
          Option.getOrElse(() => false)
        )
      ),
  }

  return Layer.succeed(IngestJobRepository, repo)
}
