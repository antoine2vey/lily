import { Array, Cause, Effect, Exit } from 'effect'

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
