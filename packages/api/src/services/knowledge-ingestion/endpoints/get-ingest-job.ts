import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import { IngestJobNotFoundError } from '@lily/shared/errors/knowledge'
import type { IngestJob } from '@lily/shared/knowledge'
import { Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const getIngestJob = (
  id: string
): Effect.Effect<
  IngestJob,
  SqlError | IngestJobNotFoundError,
  IngestJobRepository
> =>
  Effect.gen(function* () {
    const repo = yield* IngestJobRepository
    const job = yield* repo.findById(id)

    return yield* Effect.fromOption(
      Option.fromNullishOr(job),
      () => new IngestJobNotFoundError({ jobId: id })
    )
  }).pipe(
    Effect.withSpan('KnowledgeIngestion.getIngestJob', {
      attributes: { 'job.id': id },
    })
  )
