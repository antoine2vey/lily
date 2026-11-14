import { Transaction } from '@lily/api/kernel/transact'
import { Array, Effect, identity, Ref } from 'effect'

export const transactInMemory = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, Transaction>> =>
  Effect.gen(function* () {
    const registered = yield* Ref.make<ReadonlyArray<Effect.Effect<void>>>([])
    const result = yield* Effect.provideService(
      effect,
      Transaction,
      Transaction.of({
        afterCommit: (registering) =>
          Ref.update(registered, Array.append(registering)),
      })
    )
    yield* Effect.flatMap(
      Ref.get(registered),
      Effect.forEach(identity, { discard: true })
    )
    return result
  })
