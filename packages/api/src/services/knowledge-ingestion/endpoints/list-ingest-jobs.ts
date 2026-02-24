import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import type { IngestJob } from '@lily/shared/knowledge'
import { Effect } from 'effect'
import type { UnknownException } from 'effect/Cause'

export const listIngestJobs: Effect.Effect<
  IngestJob[],
  UnknownException,
  IngestJobRepository
> = Effect.gen(function* () {
  const repo = yield* IngestJobRepository
  return yield* repo.findAll()
}).pipe(Effect.withSpan('KnowledgeIngestion.listIngestJobs'))
