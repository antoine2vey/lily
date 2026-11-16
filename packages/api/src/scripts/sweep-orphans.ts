import { BunRuntime } from '@effect/platform-bun'
import { StoredRefRepositoryLive } from '@lily/api/repositories/stored-ref.repository'
import {
  DeletesFailed,
  decisionLine,
  parseFlags,
  summaryLines,
  sweepOrphans,
} from '@lily/api/scripts/orphan-sweep'
import { DrizzleLive, PgLive } from '@lily/db'
import { GCSService } from '@lily/shared/server'
import { Array, Console, Effect, Layer } from 'effect'

const sweep = Effect.gen(function* () {
  const options = yield* parseFlags(Array.drop(process.argv, 2))
  const gcs = yield* GCSService
  const result = yield* sweepOrphans(options)
  yield* Effect.forEach(
    [
      ...Array.map(result.decided, decisionLine),
      ...summaryLines(result, gcs.bucketNames),
    ],
    Console.log,
    { discard: true }
  )
  const failed = Array.filter(result.outcomes, (o) => o._tag === 'Failed')
  if (Array.isReadonlyArrayNonEmpty(failed)) {
    return yield* new DeletesFailed({ count: failed.length })
  }
})

BunRuntime.runMain(
  sweep.pipe(
    Effect.provide(
      Layer.mergeAll(
        GCSService.layer,
        StoredRefRepositoryLive.pipe(
          Layer.provideMerge(DrizzleLive),
          Layer.provideMerge(PgLive)
        )
      )
    )
  )
)
