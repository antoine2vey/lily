import type { SqlError } from '@effect/sql/SqlError'
import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import { IngestJobNotFoundError } from '@lily/shared/errors/knowledge'
import type { IngestJob } from '@lily/shared/knowledge'
import { Effect, Option } from 'effect'

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

    return yield* Option.match(Option.fromNullable(job), {
      onNone: () => Effect.fail(new IngestJobNotFoundError({ jobId: id })),
      onSome: Effect.succeed,
    })
  }).pipe(
    Effect.withSpan('KnowledgeIngestion.getIngestJob', {
      attributes: { 'job.id': id },
    })
  )
