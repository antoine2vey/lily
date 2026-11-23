import { Cause, Effect, Schedule } from 'effect'

export const eventRetryPolicy = Schedule.max([
  Schedule.exponential('100 millis'),
  Schedule.recurs(3),
])

export const publishWithRetry = <E, R>(
  effect: Effect.Effect<void, E, R>
): Effect.Effect<void, never, R> =>
  effect.pipe(
    Effect.retry(eventRetryPolicy),
    Effect.catchCause((cause) =>
      Effect.logWarning('[event-bus] Event publish failed after retries', {
        cause: Cause.pretty(cause),
      })
    ),
    Effect.withSpan('EventBus.publish')
  )
