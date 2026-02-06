import { Effect, Schedule } from 'effect'

// Exponential backoff: 100ms -> 200ms -> 400ms (max 3 retries)
export const eventRetryPolicy = Schedule.exponential('100 millis').pipe(
  Schedule.compose(Schedule.recurs(3))
)

// Helper to publish with retry, ignoring final failure
export const publishWithRetry = <E, R>(
  effect: Effect.Effect<void, E, R>
): Effect.Effect<void, never, R> =>
  effect.pipe(
    Effect.retry(eventRetryPolicy),
    Effect.ignore,
    Effect.withSpan('EventBus.publish')
  )
