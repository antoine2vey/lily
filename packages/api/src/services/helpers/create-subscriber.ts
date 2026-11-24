import { type AppEvent, EventBus } from '@lily/api/events'
import type { EventBusConnectionError } from '@lily/api/services/event-bus/types'
import { drainOnInterrupt } from '@lily/api/services/helpers/create-scheduler'
import { Cause, Effect, Queue, type Scope } from 'effect'

export const createSubscriber = <E, R>(config: {
  readonly name: string
  readonly handle: (event: AppEvent) => Effect.Effect<unknown, E, R>
}): Effect.Effect<void, EventBusConnectionError, EventBus | R | Scope.Scope> =>
  Effect.gen(function* () {
    const eventBus = yield* EventBus
    const queue = yield* eventBus.subscribe

    const handleSafely = (event: AppEvent) =>
      config.handle(event).pipe(
        Effect.tapCause((cause) =>
          Effect.logError(`[${config.name}] Unhandled error handling event`, {
            event: event._tag,
            cause: Cause.pretty(cause),
          })
        ),
        // Recover outside the span so a failed event still ends it with an error status.
        Effect.withSpan(`${config.name}.process`, {
          attributes: { 'event._tag': event._tag },
        }),
        Effect.catchCause(() => Effect.void),
        drainOnInterrupt(config.name)
      )

    yield* Effect.forkScoped(
      Effect.forever(Queue.take(queue).pipe(Effect.flatMap(handleSafely)))
    )
  })
