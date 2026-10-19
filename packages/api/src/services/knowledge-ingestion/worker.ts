import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import { createDrainableScheduler } from '@lily/api/services/helpers/create-scheduler'
import { processIngestJob } from '@lily/api/services/knowledge-ingestion/processor'
import { DateTime, Duration, Effect, Option } from 'effect'

/**
 * How long a claim may go without progress before the job is handed back.
 * The processor refreshes the claim after every document, so this only has
 * to cover one document's worst case, not a whole job:
 * - Reddit fetch: 6 s pause, then up to 5 rate-limit retries that each sleep
 *   the server's retry-after (observed up to 60 s): about 5 min.
 * - Enrichment: up to 11 chunks (post + 10 comments) in waves of 5, each
 *   chunk 4 attempts of 10 s plus 7 s of backoff: about 2.5 min.
 * - Embedding: one call with a 60 s timeout.
 * That is about 9 min; 15 gives slack without leaving a dead job idle long.
 * The first refresh comes after the first document, and listing a
 * subreddit before that takes at most 10 pages of 6 s plus the same
 * retries, which also fits.
 */
export const CLAIM_TIMEOUT = Duration.minutes(15)

/** One tick: re-queue abandoned jobs, then claim and run at most one job. */
export const pollIngestJobs = Effect.gen(function* () {
  const jobRepo = yield* IngestJobRepository

  const released = yield* jobRepo.releaseStaleClaims(
    DateTime.toDateUtc(
      DateTime.subtractDuration(DateTime.nowUnsafe(), CLAIM_TIMEOUT)
    )
  )
  if (released > 0) {
    yield* Effect.log(
      `Re-queued ${released} knowledge ingestion jobs with abandoned claims`
    )
  }

  const job = yield* jobRepo.claimNext()
  return yield* Option.match(Option.fromNullishOr(job), {
    onNone: () => Effect.succeed(false),
    onSome: (claimed) =>
      Effect.log(`Claimed knowledge ingestion job ${claimed.id}`).pipe(
        Effect.andThen(processIngestJob(claimed)),
        Effect.as(true)
      ),
  })
})

export const startKnowledgeIngestionWorker = createDrainableScheduler({
  name: 'knowledge-ingestion-worker',
  interval: '30 seconds',
  runOnStartup: false,
  task: pollIngestJobs,
})
