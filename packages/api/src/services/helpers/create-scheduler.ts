import {
  Array,
  Cause,
  type Duration,
  Effect,
  Exit,
  Fiber,
  type Scope,
} from 'effect'

/**
 * How long each shutdown phase waits for in-flight work. The HTTP server and
 * the schedulers drain in parallel (see `src/index.ts`), then `ChatTurns`
 * drains the turns still saving a reply. `drainingSeconds` on the API service
 * in `.railway/railway.ts` covers both phases.
 */
export const SHUTDOWN_DRAIN_DEADLINE: Duration.Input = '20 seconds'

/**
 * Lets `step` finish when the calling fiber is interrupted, waiting at most
 * `deadline` before interrupting the step too. The caller's interruption
 * still wins once the step settles, so a loop built from drained steps stops
 * starting new ones on shutdown.
 *
 * ```typescript
 * Effect.forever(processNextMessage.pipe(drainOnInterrupt('worker')))
 * ```
 */
export const drainOnInterrupt =
  (name: string, deadline: Duration.Input = SHUTDOWN_DRAIN_DEADLINE) =>
  <A, E, R>(step: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const fiber = yield* Effect.forkDetach(step, { startImmediately: true })
        return yield* restore(Fiber.join(fiber)).pipe(
          Effect.onInterrupt(() =>
            Effect.log(
              `[${name}] Shutting down, finishing the current step`
            ).pipe(
              Effect.andThen(Fiber.await(fiber)),
              Effect.timeoutOrElse({
                duration: deadline,
                orElse: () =>
                  Effect.logWarning(
                    `[${name}] Step still running after ${String(deadline)}, interrupting it`
                  ).pipe(Effect.andThen(Fiber.interrupt(fiber))),
              }),
              Effect.asVoid
            )
          )
        )
      })
    )

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
 * - Graceful shutdown: closing that Scope stops new ticks and lets an
 *   in-flight tick finish (see `drainOnInterrupt`).
 * - Span instrumentation: each poll cycle gets a named span.
 * - Consistent logging: logs scheduler start with interval info.
 *
 * Usage:
 * ```typescript
 * export const startRecapScheduler = createScheduler({
 *   name: 'recap-scheduler',
 *   interval: '1 hour',
 *   runOnStartup: true,
 *   task: sendRecaps,
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
    Effect.withSpan(`${config.name}.poll`),
    drainOnInterrupt(config.name)
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
    Effect.withSpan(`${config.name}.poll`),
    drainOnInterrupt(config.name)
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

export interface Tally {
  readonly due: number
  readonly advanced: number
  readonly failed: number
}

type Settled = 'advanced' | 'stayed' | 'failed'

/**
 * Runs `step` for each item, one after the other. `step` answers whether it
 * advanced its item. A step that fails or dies is logged under `[name]` and
 * counted, and the next item still runs. An interruption is passed on, so a
 * shutdown still ends the tick.
 */
export const eachIsolated = <A, R>(
  name: string,
  items: ReadonlyArray<A>,
  key: (item: A) => string,
  step: (item: A) => Effect.Effect<boolean, unknown, R>
): Effect.Effect<Tally, never, R> =>
  Effect.forEach(items, (item) =>
    Effect.flatMap(
      Effect.exit(step(item)),
      Exit.match({
        onSuccess: (advanced): Effect.Effect<Settled> =>
          Effect.succeed(advanced ? 'advanced' : 'stayed'),
        onFailure: (cause): Effect.Effect<Settled> =>
          Cause.hasInterrupts(cause)
            ? Effect.interrupt
            : Effect.logWarning(
                `[${name}] Item failed, left for the next tick`,
                {
                  item: key(item),
                  cause: Cause.pretty(cause),
                }
              ).pipe(Effect.as('failed')),
      })
    )
  ).pipe(
    Effect.map((settled) => ({
      due: items.length,
      advanced: Array.filter(settled, (one) => one === 'advanced').length,
      failed: Array.filter(settled, (one) => one === 'failed').length,
    }))
  )
