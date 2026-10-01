import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import type { IngestJob } from '@lily/shared/knowledge'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const createIngestJob = (
  adapter: string,
  config: unknown
): Effect.Effect<IngestJob, SqlError, IngestJobRepository> =>
  Effect.gen(function* () {
    const repo = yield* IngestJobRepository
    return yield* repo.create(adapter, config)
  }).pipe(
    Effect.withSpan('KnowledgeIngestion.createIngestJob', {
      attributes: { adapter },
    })
  )
