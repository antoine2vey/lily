import { type AppEvent, EventBus } from '@lily/api/events'
import { drainOnInterrupt } from '@lily/api/services/helpers/create-scheduler'
import type { EventBusConnectionError } from '@lily/shared/server'
import { Cause, Effect, Queue, type Scope } from 'effect'

/**
 * Subscribes to the EventBus and runs `handle` on each event, one at a time,
 * for as long as the caller's Scope lives.
 *
 * - Error isolation: an event whose handling fails or dies is logged at error
 *   level with its tag and cause, and the next event is still handled.
 * - Graceful shutdown: closing the Scope stops taking events and lets the
 *   event in flight finish (see `drainOnInterrupt`).
 * - Each event gets a `${name}.process` span that carries `event._tag`.
 *
 * ```typescript
 * export const startMySubscriber = createSubscriber({
 *   name: 'my-subscriber',
 *   handle: processEvent,
 * })
 * ```
 */
export const createSubscriber = <E, R>(config: {
  readonly name: string
  readonly handle: (event: AppEvent) => Effect.Effect<unknown, E, R>
}): Effect.Effect<void, EventBusConnectionError, EventBus | R | Scope.Scope> =>
  Effect.gen(function* () {
    const eventBus = yield* EventBus
    const queue = yield* eventBus.subscribe

    const handleSafely = (event: AppEvent) =>
      config.handle(event).pipe(
        Effect.catchCause((cause) =>
          Effect.logError(`[${config.name}] Unhandled error handling event`, {
            event: event._tag,
            cause: Cause.pretty(cause),
          })
        ),
        Effect.withSpan(`${config.name}.process`, {
          attributes: { 'event._tag': event._tag },
        }),
        drainOnInterrupt(config.name)
      )

    yield* Effect.forkScoped(
      Effect.forever(Queue.take(queue).pipe(Effect.flatMap(handleSafely)))
    )
  })
