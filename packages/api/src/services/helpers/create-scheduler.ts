import { Array, Cause, Chunk, Effect, pipe } from 'effect'
import type { DurationInput } from 'effect/Duration'

/** Extract a concise error summary from a Cause (no stack traces) */
const summarizeCause = <E>(cause: Cause.Cause<E>): string => {
  const failures = pipe(
    Cause.failures(cause),
    Chunk.toReadonlyArray,
    Array.map((e) => (e instanceof Error ? e.message : globalThis.String(e)))
  )
  const defects = pipe(
    Cause.defects(cause),
    Chunk.toReadonlyArray,
    Array.map((d) => (d instanceof Error ? d.message : globalThis.String(d)))
  )
  const all = [...failures, ...defects]
  return Array.isEmptyArray(all) ? 'Unknown error' : all.join('; ')
}

/**
 * Creates a standard polling scheduler that runs a task at a fixed interval.
 *
 * Features:
 * - Error isolation: wraps the task in `catchAllCause` so unhandled errors
 *   and defects are logged but never propagate (a scheduler can never crash
 *   the server).
 * - Optional startup run: if `runOnStartup` is true, the task runs once
 *   immediately (forked to not block Layer initialization).
 * - Span instrumentation: each poll cycle gets a named span.
 * - Consistent logging: logs scheduler start with interval info.
 *
 * Usage:
 * ```typescript
 * export const startHealthScheduler = createScheduler({
 *   name: 'health-scheduler',
 *   interval: '1 hour',
 *   runOnStartup: true,
 *   task: checkOverduePlants,
 * })
 * ```
 *
 * The task should focus on business logic. It MAY handle specific errors
 * internally (e.g., logging skip reasons at INFO level), but any unhandled
 * errors will be caught and logged by the scheduler wrapper.
 */
export const createScheduler = <E, R>(config: {
  name: string
  interval: DurationInput
  runOnStartup: boolean
  task: Effect.Effect<void, E, R>
}): Effect.Effect<void, never, R> => {
  const safeTask = config.task.pipe(
    Effect.catchAllCause((cause) =>
      Effect.logError(
        `[${config.name}] Unhandled error: ${summarizeCause(cause)}`
      )
    ),
    Effect.withSpan(`${config.name}.poll`)
  )

  return Effect.gen(function* () {
    if (config.runOnStartup) {
      yield* Effect.fork(safeTask)
    }

    yield* Effect.fork(
      Effect.forever(
        Effect.sleep(config.interval).pipe(Effect.zipRight(safeTask))
      )
    )

    yield* Effect.log(`[${config.name}] Scheduler started`, {
      interval: String(config.interval),
      runOnStartup: config.runOnStartup,
    })
  })
}
