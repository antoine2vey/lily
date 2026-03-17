import {
  type IIngestJobRepository,
  IngestJobRepository,
} from '@lily/api/repositories/ingest-job.repository'
import type { IngestJob, IngestJobStatus } from '@lily/shared/knowledge'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export const createMockIngestJobRepository = (data: {
  jobs: IngestJob[]
}): Layer.Layer<IngestJobRepository> => {
  const repo: IIngestJobRepository = {
    create: (adapter: string, config: unknown) => {
      const job: IngestJob = {
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

    findPending: () =>
      Effect.succeed(Array.filter(data.jobs, (j) => j.status === 'pending')),

    updateStatus: (
      id: string,
      status: IngestJobStatus,
      counts?: { documentsFetched?: number; chunksCreated?: number }
    ) => {
      const idx = data.jobs.findIndex((j) => j.id === id)
      const existing = data.jobs[idx]
      if (idx === -1 || !existing) {
        return Effect.succeed(null)
      }
      const updated: IngestJob = {
        ...existing,
        status,
        ...(counts?.documentsFetched !== undefined
          ? { documentsFetched: counts.documentsFetched }
          : {}),
        ...(counts?.chunksCreated !== undefined
          ? { chunksCreated: counts.chunksCreated }
          : {}),
        updatedAt: new Date(),
      }
      data.jobs[idx] = updated
      return Effect.succeed(updated)
    },

    updateError: (id: string, error: string) => {
      const idx = data.jobs.findIndex((j) => j.id === id)
      const existing = data.jobs[idx]
      if (idx !== -1 && existing) {
        data.jobs[idx] = {
          ...existing,
          error,
          status: 'failed' as const,
          updatedAt: new Date(),
        }
      }
      return Effect.void
    },

    count: () => Effect.succeed(data.jobs.length),

    delete: (id: string) => {
      const idx = data.jobs.findIndex((j) => j.id === id)
      if (idx === -1) return Effect.succeed(false)
      data.jobs.splice(idx, 1)
      return Effect.succeed(true)
    },
  }

  return Layer.succeed(IngestJobRepository, repo)
}
