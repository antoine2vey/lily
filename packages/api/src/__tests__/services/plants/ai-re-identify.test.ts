import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { aiReIdentify } from '@lily/api/services/plants/endpoints/ai-re-identify'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('aiReIdentify', () => {
  const createTestLayer = () => createMockAiService()

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

  it('should not require GCS, FileService, or LimitChecker', async () => {
    const imageUrls = ['https://storage.example.com/plants/photo1.jpg']

    // Only AiService is needed - no other dependencies
    const result = await Effect.runPromise(
      aiReIdentify(imageUrls, 'en').pipe(Effect.provide(createMockAiService()))
    )

    expect(result).toBeDefined()
    expect(result.name).toBe('Mock Plant')
  })
})
