import {
  createDrainableScheduler,
  createScheduler,
} from '@lily/api/services/helpers/create-scheduler'
import { Clock, Effect, Exit, Fiber, Layer, References, Scope } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

// Shutdown is the scheduler layer's scope closing, which is what SIGTERM
// does to every layer under Layer.launch in src/index.ts.

const runTestClock = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(TestClock.layer()),
    Effect.provideService(References.MinimumLogLevel, 'None'),
    Effect.runPromise
  )

const record = (events: string[], event: string) =>
  Clock.currentTimeMillis.pipe(
    Effect.tap((t) => Effect.sync(() => events.push(`${event}@${t}`)))
  )

/**
 * Starts `scheduler` as a layer, lets the clock run to `shutdownAt`, closes
 * the layer's scope, then lets the clock run long enough for any drain and
 * any later tick. Returns the recorded events, including when shutdown ended.
 */
const shutdownTimeline = (options: {
  readonly scheduler: (
    events: string[]
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly shutdownAt: number
}) =>
  runTestClock(
    Effect.gen(function* () {
      const events: string[] = []
      const scope = yield* Scope.make()
      yield* Layer.buildWithScope(
        Layer.effectDiscard(options.scheduler(events)),
        scope
      )
      yield* TestClock.adjust(options.shutdownAt)
      const closing = yield* Effect.forkChild(
        Scope.close(scope, Exit.void).pipe(
          Effect.andThen(record(events, 'shutdown'))
        )
      )
      yield* TestClock.adjust('10 minutes')
      yield* Fiber.join(closing)
      return events
    })
  )

const slowTick = (events: string[]) =>
  record(events, 'start').pipe(
    Effect.andThen(Effect.sleep('5 seconds')),
    Effect.andThen(record(events, 'end'))
  )

describe('scheduler shutdown', () => {
  it('lets the in-flight tick finish, then starts no new tick', async () => {
    const events = await shutdownTimeline({
      scheduler: (events) =>
        createScheduler({
          name: 'test-scheduler',
          interval: '1 minute',
          runOnStartup: false,
          task: slowTick(events),
        }),
      shutdownAt: 62_000,
    })

    expect(events).toEqual(['start@60000', 'end@65000', 'shutdown@65000'])
  })

  it('stops at once when no tick is running', async () => {
    const events = await shutdownTimeline({
      scheduler: (events) =>
        createScheduler({
          name: 'test-scheduler',
          interval: '1 minute',
          runOnStartup: false,
          task: slowTick(events),
        }),
      shutdownAt: 30_000,
    })

    expect(events).toEqual(['shutdown@30000'])
  })

  it('interrupts a tick still running after the 20 second deadline', async () => {
    const events = await shutdownTimeline({
      scheduler: (events) =>
        createScheduler({
          name: 'test-scheduler',
          interval: '1 minute',
          runOnStartup: false,
          task: record(events, 'start').pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() =>
              record(events, 'interrupted').pipe(Effect.asVoid)
            )
          ),
        }),
      shutdownAt: 62_000,
    })

    expect(events).toEqual([
      'start@60000',
      'interrupted@82000',
      'shutdown@82000',
    ])
  })

  it('lets a startup run finish too', async () => {
    const events = await shutdownTimeline({
      scheduler: (events) =>
        createScheduler({
          name: 'test-scheduler',
          interval: '1 hour',
          runOnStartup: true,
          task: slowTick(events),
        }),
      shutdownAt: 2_000,
    })

    expect(events).toEqual(['start@0', 'end@5000', 'shutdown@5000'])
  })

  it('drains the drainable scheduler the same way', async () => {
    const events = await shutdownTimeline({
      scheduler: (events) =>
        createDrainableScheduler({
          name: 'test-drainable',
          interval: '1 minute',
          runOnStartup: false,
          task: slowTick(events).pipe(Effect.as(true)),
        }),
      shutdownAt: 7_000,
    })

    // Ticks at 0 (ends at 5s), cools down 1s, ticks again at 6s.
    expect(events).toEqual([
      'start@0',
      'end@5000',
      'start@6000',
      'end@11000',
      'shutdown@11000',
    ])
  })
})
