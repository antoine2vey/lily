import { Transaction } from '@lily/api/kernel/transact'
import { Array, Context, Effect, identity, Option, Ref, Tracer } from 'effect'

export const transactInMemory = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, Transaction>> =>
  Effect.gen(function* () {
    const registered = yield* Ref.make<ReadonlyArray<Effect.Effect<void>>>([])
    const result = yield* Effect.provideService(
      effect,
      Transaction,
      Transaction.of({
        afterCommit: <RA>(registering: Effect.Effect<void, never, RA>) =>
          Effect.flatMap(Effect.context<RA>(), (registeredIn) =>
            Ref.update(
              registered,
              Array.append(
                Effect.provide(
                  registering,
                  // As `transactQuietly` does, with no connection to omit.
                  Context.omit(
                    Transaction,
                    Tracer.ParentSpan
                  )(registeredIn) as Context.Context<RA>
                )
              )
            )
          ),
        held: Option.none(),
      })
    )
    yield* Effect.flatMap(
      Ref.get(registered),
      Effect.forEach(identity, { discard: true })
    )
    return result
  })
