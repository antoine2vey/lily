import { Duration, Effect, Exit, Fiber, Option, Semaphore } from 'effect'
import { TestClock } from 'effect/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OpenAIError } from '../domains/ai-chat/errors'
import { callOpenAI, OpenAIBulkhead } from '../services/ai/call-openai'

// Each call reaching OpenAI is recorded and stays open until the test settles
// it, so the test decides when a permit frees up.
const started: Array<{
  readonly signal: AbortSignal
  readonly settle: () => void
}> = []

const openAICall = (signal: AbortSignal) =>
  new Promise<string>((resolve) => {
    started.push({ signal, settle: () => resolve('done') })
  })

beforeEach(() => {
  started.length = 0
})

const DEADLINE = Duration.seconds(30)
const call = () => callOpenAI('Plant detection', DEADLINE, openAICall)

const runWithPermits = <A, E>(permits: number, effect: Effect.Effect<A, E>) =>
  effect.pipe(
    Effect.provideService(OpenAIBulkhead, Semaphore.makeUnsafe(permits)),
    Effect.provide(TestClock.layer()),
    Effect.runPromise
  )

const failureOf = (exit: Exit.Exit<unknown, OpenAIError>) =>
  Exit.findErrorOption(exit).pipe(Option.getOrUndefined)

describe('OpenAI bulkhead', () => {
  it('starts no more calls than there are permits', () =>
    runWithPermits(
      2,
      Effect.gen(function* () {
        yield* Effect.forkChild(call())
        yield* Effect.forkChild(call())
        yield* Effect.forkChild(call())
        yield* TestClock.adjust(Duration.seconds(1))

        expect(started).toHaveLength(2)
      })
    ))

  it('starts a queued call once a running call finishes', () =>
    runWithPermits(
      1,
      Effect.gen(function* () {
        const first = yield* Effect.forkChild(call())
        const queued = yield* Effect.forkChild(call())
        yield* TestClock.adjust(Duration.seconds(1))
        expect(started).toHaveLength(1)

        started[0]?.settle()
        expect(yield* Fiber.join(first)).toBe('done')
        yield* TestClock.adjust(Duration.seconds(1))
        expect(started).toHaveLength(2)

        started[1]?.settle()
        expect(yield* Fiber.join(queued)).toBe('done')
      })
    ))

  it('fails a call still queued at its deadline without calling OpenAI', () =>
    runWithPermits(
      1,
      Effect.gen(function* () {
        yield* Effect.forkChild(
          callOpenAI('Blog content', Duration.minutes(3), openAICall)
        )
        const queued = yield* Effect.forkChild(call())

        yield* TestClock.adjust(DEADLINE)
        const error = failureOf(yield* Fiber.await(queued))

        expect(error).toBeInstanceOf(OpenAIError)
        expect(error?.code).toBe('server_error')
        expect(error?.message).toContain('no response within 30s')
        expect(started).toHaveLength(1)
      })
    ))

  it('frees the permit of a call that timed out', () =>
    runWithPermits(
      1,
      Effect.gen(function* () {
        const hung = yield* Effect.forkChild(call())
        yield* TestClock.adjust(Duration.seconds(10))
        const next = yield* Effect.forkChild(call())

        yield* TestClock.adjust(Duration.seconds(20))
        expect(failureOf(yield* Fiber.await(hung))).toBeInstanceOf(OpenAIError)
        expect(started[0]?.signal.aborted).toBe(true)
        expect(started).toHaveLength(2)

        started[1]?.settle()
        expect(yield* Fiber.join(next)).toBe('done')
      })
    ))
})

describe('OpenAI bulkhead size', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const freshCallOpenAI = async () => {
    vi.resetModules()
    return (await import('../services/ai/call-openai')).callOpenAI
  }

  const countStarted = (fresh: typeof callOpenAI, calls: number) =>
    Effect.gen(function* () {
      for (let i = 0; i < calls; i++) {
        yield* Effect.forkChild(fresh('Plant detection', DEADLINE, openAICall))
      }
      yield* TestClock.adjust(Duration.seconds(1))
      return started.length
    }).pipe(Effect.provide(TestClock.layer()), Effect.runPromise)

  it('defaults to 8 concurrent calls', async () => {
    expect(await countStarted(await freshCallOpenAI(), 10)).toBe(8)
  })

  it('reads OPENAI_MAX_CONCURRENT_CALLS', async () => {
    vi.stubEnv('OPENAI_MAX_CONCURRENT_CALLS', '3')
    expect(await countStarted(await freshCallOpenAI(), 10)).toBe(3)
  })

  it('rejects a size that would block every call', async () => {
    vi.stubEnv('OPENAI_MAX_CONCURRENT_CALLS', '0')
    const fresh = await freshCallOpenAI()

    const exit = await Effect.runPromiseExit(
      fresh('Plant detection', DEADLINE, openAICall)
    )

    expect(Exit.hasDies(exit)).toBe(true)
    expect(started).toHaveLength(0)
  })
})
