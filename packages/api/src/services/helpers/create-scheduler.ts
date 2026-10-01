import { Cause, type Duration, Effect, type Scope } from 'effect'

/**
 * Creates a standard polling scheduler that runs a task at a fixed interval.
 *
 * Features:
 * - Error isolation: wraps the task in `catchCause` so unhandled errors
 *   and defects are logged but never propagate (a scheduler can never crash
 *   the server).
 * - Optional startup run: if `runOnStartup` is true, the task runs once
 *   immediately (forked to not block Layer initialization).
 * - Fibers are forked into the caller's Scope (the scheduler Layer's), so they
 *   live as long as the server. A `forkChild` here would be interrupted as
 *   soon as the Layer finished building, and no scheduler would ever tick.
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
  interval: Duration.Input
  runOnStartup: boolean
  task: Effect.Effect<void, E, R>
}): Effect.Effect<void, never, R | Scope.Scope> => {
  const safeTask = config.task.pipe(
    Effect.catchCause((cause) =>
      Effect.logError(`[${config.name}] Unhandled error in poll cycle`, {
        cause: Cause.pretty(cause),
      })
    ),
    Effect.withSpan(`${config.name}.poll`)
  )

  return Effect.gen(function* () {
    if (config.runOnStartup) {
      yield* Effect.forkScoped(safeTask)
    }

    yield* Effect.forkScoped(
      Effect.forever(
        Effect.sleep(config.interval).pipe(Effect.andThen(safeTask))
      )
    )

    yield* Effect.log(`[${config.name}] Scheduler started`, {
      interval: String(config.interval),
      runOnStartup: config.runOnStartup,
    })
  })
}

/**
 * Like `createScheduler`, but the task returns a boolean indicating whether
 * there is likely more work to do.  When `true`, the next poll runs after a
 * short cooldown (1 s) instead of the full interval — draining backlogs as
 * fast as possible while still yielding to the event loop.
 */
export const createDrainableScheduler = <E, R>(config: {
  name: string
  interval: Duration.Input
  runOnStartup: boolean
  task: Effect.Effect<boolean, E, R>
}): Effect.Effect<void, never, R | Scope.Scope> => {
  const safeTask = config.task.pipe(
    Effect.catchCause((cause) => {
      const pretty = Cause.pretty(cause)
      return Effect.logError(`[${config.name}] Unhandled error in poll cycle`, {
        cause: pretty,
      }).pipe(Effect.as(false))
    }),
    Effect.withSpan(`${config.name}.poll`)
  )

  const drainCooldown = '1 second'
  const fullInterval = config.interval

  const loop = safeTask.pipe(
    Effect.flatMap((hasMore) =>
      Effect.sleep(hasMore ? drainCooldown : fullInterval)
    ),
    Effect.forever
  )

  return Effect.gen(function* () {
    if (config.runOnStartup) {
      yield* Effect.forkScoped(safeTask)
    }

    yield* Effect.forkScoped(loop)

    yield* Effect.log(`[${config.name}] Drainable scheduler started`, {
      interval: String(config.interval),
      drainCooldown,
      runOnStartup: config.runOnStartup,
    })
  })
}
