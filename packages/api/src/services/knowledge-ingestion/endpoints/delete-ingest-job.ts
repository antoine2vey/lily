import type { SqlError } from '@effect/sql/SqlError'
import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import { IngestJobNotFoundError } from '@lily/shared/errors/knowledge'
import { Effect } from 'effect'

export const deleteIngestJob = (
  id: string
): Effect.Effect<
  void,
  SqlError | IngestJobNotFoundError,
  IngestJobRepository
> =>
  Effect.gen(function* () {
    const repo = yield* IngestJobRepository
    const deleted = yield* repo.delete(id)

    if (!deleted) {
      return yield* Effect.fail(new IngestJobNotFoundError({ jobId: id }))
    }
  }).pipe(
    Effect.withSpan('KnowledgeIngestion.deleteIngestJob', {
      attributes: { 'job.id': id },
    })
  )
