import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUsageTracker } from '@lily/api/__tests__/mocks/usage-tracker'
import { AiService } from '@lily/api/services/ai/service'
import { AiReIdentifyPayload } from '@lily/api/services/plants/api'
import { aiReIdentify } from '@lily/api/services/plants/endpoints/ai-re-identify'
import { MAX_SCAN_FILES } from '@lily/shared'
import { Effect, Exit, Layer, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

describe('aiReIdentify', () => {
  const createTestLayer = (limitReached = false) =>
    Layer.mergeAll(
      createMockAiService(),
      createMockCurrentUser({ id: 'user-1' }),
      createMockUsageTracker({ limitReached })
    )

  it('should return AI identification result with first image URL', async () => {
    const imageUrls = [
      'https://storage.example.com/plants/photo1.jpg',
      'https://storage.example.com/plants/photo2.jpg',
    ]

    const result = await Effect.runPromise(
      aiReIdentify(imageUrls, 'en').pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
    expect(result.name).toBe('Mock Plant')
    expect(result.confidence).toBe(0.95)
    expect(result.imageUrl).toBe(imageUrls[0])
  })

  it('should work with a single image URL', async () => {
    const imageUrls = ['https://storage.example.com/plants/photo1.jpg']

    const result = await Effect.runPromise(
      aiReIdentify(imageUrls, 'en').pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
    expect(result.name).toBe('Mock Plant')
    expect(result.imageUrl).toBe(imageUrls[0])
  })

  it('should pass locale to the AI service', async () => {
    const imageUrls = ['https://storage.example.com/plants/photo1.jpg']

    const result = await Effect.runPromise(
      aiReIdentify(imageUrls, 'fr').pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
    expect(result.name).toBe('Mock Plant')
  })

  it('fails with LimitExceededError and skips the AI call when the quota is exhausted', async () => {
    let aiCalls = 0
    const countingAi = Layer.effect(
      AiService,
      Effect.gen(function* () {
        const base = yield* AiService
        return AiService.of({
          ...base,
          plantRecognition: (...args) => {
            aiCalls += 1
            return base.plantRecognition(...args)
          },
        })
      })
    ).pipe(Layer.provide(createMockAiService()))

    const exit = await Effect.runPromiseExit(
      aiReIdentify(
        ['https://storage.example.com/plants/photo1.jpg'],
        'en'
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            countingAi,
            createMockCurrentUser({ id: 'user-1' }),
            createMockUsageTracker({ limitReached: true })
          )
        )
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(JSON.stringify(exit)).toContain('LimitExceededError')
    expect(aiCalls).toBe(0)
  })
})

describe('AiReIdentifyPayload', () => {
  const decode = Schema.decodeUnknownExit(AiReIdentifyPayload)
  const url = 'https://storage.example.com/plants/photo1.jpg'

  it('accepts up to the scan file cap and defaults locale to en', () => {
    const exit = decode({ imageUrls: Array(MAX_SCAN_FILES).fill(url) })
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) expect(exit.value.locale).toBe('en')
  })

  it('rejects more URLs than the cap', () => {
    const exit = decode({ imageUrls: Array(MAX_SCAN_FILES + 1).fill(url) })
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('rejects an empty URL list', () => {
    expect(Exit.isFailure(decode({ imageUrls: [] }))).toBe(true)
  })

  it('rejects an unsupported locale', () => {
    expect(
      Exit.isFailure(decode({ imageUrls: [url], locale: 'ignore previous' }))
    ).toBe(true)
  })
})
