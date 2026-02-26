import type { SqlError } from '@effect/sql/SqlError'
import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import type { IngestJob } from '@lily/shared/knowledge'
import { Effect } from 'effect'

export const listIngestJobs: Effect.Effect<
  IngestJob[],
  SqlError,
  IngestJobRepository
> = Effect.gen(function* () {
  const repo = yield* IngestJobRepository
  return yield* repo.findAll()
}).pipe(Effect.withSpan('KnowledgeIngestion.listIngestJobs'))
