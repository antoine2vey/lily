import type { Held } from '@lily/api/contexts/canopy/domain/canopy'
import type { CanopyWrite } from '@lily/api/contexts/canopy/domain/vocabulary'
import { makeLockAndLoad } from '@lily/api/contexts/canopy/store/lock'
import type { LockPlan } from '@lily/api/contexts/canopy/store/lock-plan'
import { makeWrite } from '@lily/api/contexts/canopy/store/write'
import type { Transaction } from '@lily/api/kernel/transact'
import { Context, Effect, Layer } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Each method runs inside the transaction its caller opened.
 * @effect-expect-leaking Transaction
 */
export class CanopyStore extends Context.Service<
  CanopyStore,
  {
    readonly lockAndLoad: (
      plan: LockPlan
    ) => Effect.Effect<Held, SqlError, Transaction>
    readonly apply: (
      writes: ReadonlyArray<CanopyWrite>
    ) => Effect.Effect<void, SqlError, Transaction>
  }
>()('canopy/CanopyStore') {}

export const CanopyStoreLive = Layer.effect(
  CanopyStore,
  Effect.gen(function* () {
    const lockAndLoad = yield* makeLockAndLoad
    const write = yield* makeWrite

    return CanopyStore.of({
      lockAndLoad: (plan) =>
        lockAndLoad(plan).pipe(Effect.withSpan('CanopyStore.lockAndLoad')),
      apply: (writes) =>
        Effect.forEach(writes, write, { discard: true }).pipe(
          Effect.withSpan('CanopyStore.apply')
        ),
    })
  })
)
