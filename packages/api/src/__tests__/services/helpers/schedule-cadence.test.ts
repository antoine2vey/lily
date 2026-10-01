import { eventRetryPolicy, publishWithRetry } from '@lily/api/events'
import { postStreamRetryPolicy } from '@lily/api/services/ai-chat/endpoints/stream-chat-message'
import {
  createDrainableScheduler,
  createScheduler,
} from '@lily/api/services/helpers/create-scheduler'
import {
  RateLimitedError,
  redditRetryPolicy,
} from '@lily/api/services/knowledge-ingestion/adapters/reddit.adapter'
import { enrichmentRetryPolicy } from '@lily/api/services/knowledge-ingestion/processing/enrichment'
import { workerRetryPolicy } from '@lily/api/services/notification-scheduler/worker'
import { AdapterError } from '@lily/shared/errors/knowledge'
import {
  Array,
  Clock,
  type Duration,
  Effect,
  Fiber,
  Layer,
  References,
  type Schedule,
  type Scope,
} from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

// Timelines pin the production retry and scheduler cadence.

const runTestClock = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(TestClock.layer()),
    Effect.provideService(References.MinimumLogLevel, 'None'),
    Effect.runPromise
  )

const advance = (steps: number, step: Duration.Input) =>
  Effect.forEach(Array.range(1, steps), () => TestClock.adjust(step), {
    discard: true,
  })

// Built the way src/index.ts wires schedulers (Layer.mergeAll builds each
// member in its own fiber), so a loop forked with forkChild, which dies when
// that build fiber ends, shows up here as a scheduler that never ticks.
const startAsLayer = <R>(scheduler: Effect.Effect<void, never, R>) =>
  Layer.build(Layer.mergeAll(Layer.effectDiscard(scheduler), Layer.empty))

const attemptTimeline = <E>(
  schedule: Schedule.Schedule<unknown, E>,
  error: E
): Promise<ReadonlyArray<number>> =>
  runTestClock(
    Effect.gen(function* () {
      const attempts: number[] = []
      const fiber = yield* Effect.forkChild(
        Clock.currentTimeMillis.pipe(
          Effect.tap((t) => Effect.sync(() => attempts.push(t))),
          Effect.andThen(Effect.fail(error)),
          Effect.retry(schedule),
          Effect.result
        )
      )
      yield* advance(200, '100 millis')
      yield* Fiber.join(fiber)
      return attempts
    })
  )

describe('retry schedules keep their v3 cadence', () => {
  it('event bus: 3 retries at 100ms, 200ms, 400ms', async () => {
    expect(await attemptTimeline(eventRetryPolicy, 'boom')).toEqual([
      0, 100, 300, 700,
    ])
  })

  it('post-stream persistence: 3 retries at 200ms, 400ms, 800ms', async () => {
    expect(await attemptTimeline(postStreamRetryPolicy, 'boom')).toEqual([
      0, 200, 600, 1400,
    ])
  })

  it('notification worker: 3 retries at 1s, 2s, 4s', async () => {
    expect(await attemptTimeline(workerRetryPolicy, 'boom')).toEqual([
      0, 1000, 3000, 7000,
    ])
  })

  it('knowledge enrichment: 3 retries at 1s, 2s, 4s', async () => {
    expect(await attemptTimeline(enrichmentRetryPolicy, 'boom')).toEqual([
      0, 1000, 3000, 7000,
    ])
  })

  it('reddit: 5 immediate retries while rate limited', async () => {
    expect(
      await attemptTimeline(redditRetryPolicy, new RateLimitedError(1))
    ).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('reddit: no retry for any other error', async () => {
    expect(
      await attemptTimeline(
        redditRetryPolicy,
        new AdapterError({ message: 'down', adapter: 'reddit' })
      )
    ).toEqual([0])
  })

  it('publishWithRetry swallows the failure after the last retry', async () => {
    const outcome = await runTestClock(
      Effect.gen(function* () {
        let attempts = 0
        const fiber = yield* Effect.forkChild(
          publishWithRetry(
            Effect.suspend(() => {
              attempts++
              return Effect.fail('redis down')
            })
          )
        )
        yield* advance(20, '100 millis')
        yield* Fiber.join(fiber)
        return attempts
      })
    )
    expect(outcome).toBe(4)
  })
})

describe('scheduler loops keep their v3 cadence', () => {
  it('createScheduler runs at startup, then once per interval', async () => {
    const ticks = await runTestClock(
      Effect.gen(function* () {
        const times: number[] = []
        yield* startAsLayer(
          createScheduler({
            name: 'test-scheduler',
            interval: '1 minute',
            runOnStartup: true,
            task: Clock.currentTimeMillis.pipe(
              Effect.map((t) => {
                times.push(t)
              })
            ),
          })
        )
        yield* advance(35, '10 seconds')
        return times
      })
    )
    expect(ticks).toEqual([0, 60_000, 120_000, 180_000, 240_000, 300_000])
  })

  it('createScheduler without runOnStartup waits a full interval', async () => {
    const ticks = await runTestClock(
      Effect.gen(function* () {
        const times: number[] = []
        yield* startAsLayer(
          createScheduler({
            name: 'test-scheduler',
            interval: '1 hour',
            runOnStartup: false,
            task: Clock.currentTimeMillis.pipe(
              Effect.map((t) => {
                times.push(t)
              })
            ),
          })
        )
        yield* advance(23, '5 minutes')
        return times
      })
    )
    expect(ticks).toEqual([3_600_000])
  })

  it('createScheduler keeps ticking after a failing cycle', async () => {
    const ticks = await runTestClock(
      Effect.gen(function* () {
        const times: number[] = []
        yield* startAsLayer(
          createScheduler({
            name: 'test-scheduler',
            interval: '1 minute',
            runOnStartup: false,
            task: Clock.currentTimeMillis.pipe(
              Effect.tap((t) => Effect.sync(() => times.push(t))),
              Effect.andThen(Effect.die('defect'))
            ),
          })
        )
        yield* advance(19, '10 seconds')
        return times
      })
    )
    expect(ticks).toEqual([60_000, 120_000, 180_000])
  })

  it('createDrainableScheduler drains at 1s while hasMore, then idles a full interval', async () => {
    const ticks = await runTestClock(
      Effect.gen(function* () {
        const times: number[] = []
        yield* startAsLayer(
          createDrainableScheduler({
            name: 'test-drainable',
            interval: '1 minute',
            runOnStartup: false,
            task: Clock.currentTimeMillis.pipe(
              Effect.map((t) => {
                times.push(t)
                return times.length <= 2
              })
            ),
          })
        )
        yield* advance(20, '10 seconds')
        return times
      })
    )
    expect(ticks).toEqual([0, 1000, 2000, 62_000, 122_000, 182_000])
  })
})
