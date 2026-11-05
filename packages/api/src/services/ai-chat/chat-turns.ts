import { SHUTDOWN_DRAIN_DEADLINE } from '@lily/api/services/helpers/create-scheduler'
import { Context, Effect, type Fiber, FiberSet, Layer } from 'effect'

/**
 * Runs the server-side half of each chat turn (draining the model stream and
 * saving the reply) past the request that started it. On shutdown, running
 * turns get `SHUTDOWN_DRAIN_DEADLINE` to finish before they are interrupted.
 */
export class ChatTurns extends Context.Service<ChatTurns>()('ChatTurns', {
  make: Effect.gen(function* () {
    const turns = yield* FiberSet.make()

    yield* Effect.addFinalizer(() =>
      FiberSet.awaitEmpty(turns).pipe(
        Effect.timeoutOrElse({
          duration: SHUTDOWN_DRAIN_DEADLINE,
          orElse: () =>
            Effect.logWarning(
              `[chat-turns] Chat turns still running after ${String(SHUTDOWN_DRAIN_DEADLINE)}, interrupting them`
            ),
        })
      )
    )

    return {
      fork: <A, E>(
        turn: Effect.Effect<A, E>
      ): Effect.Effect<Fiber.Fiber<A, E>> => FiberSet.run(turns, turn),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
