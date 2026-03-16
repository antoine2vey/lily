import { IngestJobRepository } from '@lily/api/repositories/ingest-job.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { processIngestJob } from '@lily/api/services/knowledge-ingestion/processor'
import { Array, Effect } from 'effect'

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

export const startKnowledgeIngestionWorker = createScheduler({
  name: 'knowledge-ingestion-worker',
  interval: '30 seconds',
  runOnStartup: false,
  task: pollPendingJobs,
})
