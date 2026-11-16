import { ProcessedChunkRepository } from '@lily/api/repositories/processed-chunk.repository'
import { createDrainableScheduler } from '@lily/api/services/helpers/create-scheduler'
import { embedText } from '@lily/api/services/rag/embedding.service'
import { Array, Effect, Option } from 'effect'

/**
 * Chunks embedded per tick. Each chunk is its own request with a 30 s
 * timeout, five at a time, so a tick during an embedding outage lasts at most
 * 5 min and ends before the next one starts.
 */
export const BACKFILL_BATCH_SIZE = 50

/**
 * One tick: embeds chunks the processor stored without an embedding after an
 * `EmbeddingError`, so search can return them. A chunk that fails again stays
 * for a later tick. Returns true when the batch was full and at least one
 * chunk was embedded: more chunks probably wait, and the model answers. A
 * full batch with nothing embedded is an outage, and the next tick waits the
 * whole interval.
 */
export const backfillEmbeddings = Effect.gen(function* () {
  const chunkRepo = yield* ProcessedChunkRepository

  const chunks = yield* chunkRepo.findUnembedded(BACKFILL_BATCH_SIZE)
  if (Array.isReadonlyArrayEmpty(chunks)) {
    return false
  }

  const errors = yield* Effect.forEach(
    chunks,
    (chunk) =>
      embedText(chunk.text).pipe(
        Effect.flatMap((embedding) =>
          chunkRepo.setEmbedding(chunk.id, embedding)
        ),
        Effect.as(Option.none<string>()),
        Effect.catchTag('EmbeddingError', (error) =>
          Effect.succeedSome(error.message)
        )
      ),
    { concurrency: 5 }
  )

  const failures = Array.getSomes(errors)
  const embedded = chunks.length - failures.length
  yield* Array.match(failures, {
    onEmpty: () => Effect.log(`Backfilled ${embedded} chunk embeddings`),
    onNonEmpty: (failed) =>
      Effect.logWarning(
        `Backfilled ${embedded} chunk embeddings, ${failed.length} failed and stay for a later tick`,
        { error: Array.headNonEmpty(failed) }
      ),
  })

  return chunks.length === BACKFILL_BATCH_SIZE && embedded > 0
})

export const startEmbeddingBackfillScheduler = createDrainableScheduler({
  name: 'knowledge-embedding-backfill',
  interval: '10 minutes',
  runOnStartup: false,
  task: backfillEmbeddings,
})
