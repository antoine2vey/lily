import { generateConversationTitle } from '@lily/api/services/ai/generate-conversation-title'
import {
  plantCardScan,
  plantCardScanMultiple,
} from '@lily/api/services/ai/plant-card-scan'
import { plantDetect } from '@lily/api/services/ai/plant-detect'
import { plantRecognition } from '@lily/api/services/ai/plant-recognition'

import { OpenAIError } from '@lily/shared'
import { failureOf } from '@lily/shared/testing'
import { Duration, Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signals: AbortSignal[] = []

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn((options: { abortSignal?: AbortSignal }) => {
    if (options.abortSignal) signals.push(options.abortSignal)
    return new Promise<never>(() => {})
  }),
}))

beforeEach(() => {
  signals.length = 0
})

const IMAGE = 'https://example.com/plant.jpg'

const cases: ReadonlyArray<{
  readonly name: string
  readonly run: () => Effect.Effect<unknown, OpenAIError>
  readonly deadline: Duration.Duration
}> = [
  {
    name: 'plantRecognition',
    run: () => plantRecognition(IMAGE),
    deadline: Duration.seconds(30),
  },
  {
    name: 'plantDetect',
    run: () => plantDetect(IMAGE),
    deadline: Duration.seconds(30),
  },
  {
    name: 'plantCardScan',
    run: () => plantCardScan(IMAGE),
    deadline: Duration.seconds(30),
  },
  {
    name: 'plantCardScanMultiple',
    run: () => plantCardScanMultiple([IMAGE, IMAGE]),
    deadline: Duration.seconds(30),
  },
  {
    name: 'generateConversationTitle',
    run: () =>
      generateConversationTitle({ userMessage: 'hi', assistantReply: 'hey' }),
    deadline: Duration.seconds(15),
  },
]

describe('OpenAI calls against a provider that never responds', () => {
  it.each(cases)(
    '$name fails with a timeout and aborts the request',
    ({ run, deadline }) =>
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(run())

        yield* TestClock.adjust(
          Duration.subtract(deadline, Duration.seconds(1))
        )
        expect(fiber.pollUnsafe()).toBeUndefined()
        expect(signals).toHaveLength(1)
        expect(signals[0]?.aborted).toBe(false)

        yield* TestClock.adjust(Duration.seconds(1))
        const exit = yield* Fiber.await(fiber)

        const error = failureOf(exit)
        expect(error).toBeInstanceOf(OpenAIError)
        expect(error.code).toBe('server_error')
        expect(error.message).toContain('no response within')
        expect(signals[0]?.aborted).toBe(true)
      }).pipe(Effect.provide(TestClock.layer()), Effect.runPromise)
  )
})
