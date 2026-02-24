import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import { processIngestJob } from '@lily/api/services/knowledge-ingestion/processor'
import { Array, Effect } from 'effect'
import type { DurationInput } from 'effect/Duration'

const POLL_INTERVAL: DurationInput = '30 seconds'

const pollPendingJobs = Effect.gen(function* () {
  const jobRepo = yield* IngestJobRepository

  const pendingJobs = yield* jobRepo.findPending()

  if (Array.isEmptyArray(pendingJobs)) {
    return
  }

  yield* Effect.log(
    `Found ${pendingJobs.length} pending knowledge ingestion jobs`
  )

  // Process jobs sequentially to avoid overwhelming external APIs
  yield* Effect.forEach(pendingJobs, (job) => processIngestJob(job))
})

export const startKnowledgeIngestionWorker = Effect.gen(function* () {
  yield* Effect.log('Knowledge ingestion worker starting...')

  yield* Effect.fork(
    Effect.forever(
      Effect.sleep(POLL_INTERVAL).pipe(
        Effect.zipRight(
          pollPendingJobs.pipe(
            Effect.catchAll((error) =>
              Effect.logError('Knowledge ingestion worker error', {
                error: String(error),
              })
            )
          )
        )
      )
    )
  )

  yield* Effect.log('Knowledge ingestion worker started')
})
