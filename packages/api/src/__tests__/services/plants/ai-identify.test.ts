import type { PersistedFile } from '@effect/platform/Multipart'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockUsageTrackerLive } from '@lily/api/__tests__/mocks/usage-tracker'
import { AiService } from '@lily/api/services/ai/service'
import { aiIdentify } from '@lily/api/services/plants/endpoints/ai-identify'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('aiIdentify', () => {
  const mockFile = {
    _tag: 'PersistedFile',
    key: 'file',
    name: 'plant-photo.jpg',
    contentType: 'image/jpeg',
    path: '/tmp/plant-photo.jpg',
  } as unknown as PersistedFile

  const createTestLayer = () =>
    Layer.mergeAll(
      createMockAiService(),
      createMockGCSService(),
      createMockFileService(),
      createMockFileSystem(),
      createMockCurrentUser({ id: 'user-1' }),
      MockLimitCheckerLive,
      MockUsageTrackerLive
    )

  it('should return a typed object with plant identification', async () => {
    const result = await Effect.runPromise(
      aiIdentify([mockFile]).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
    expect(result.name).toBe('Mock Plant')
    expect(result.confidence).toBe(0.95)
    expect(result.imageUrl).toBeDefined()
  })

  it('should use plantRecognitionWithRetry for automatic quality retry', async () => {
    let callCount = 0
    const aiServiceWithRetryTracking = Layer.succeed(AiService, {
      plantRecognition: () => Effect.succeed({} as never),
      plantRecognitionWithRetry: (
        _urls: string | readonly string[],
        _locale?: string,
        _maxAttempts?: number
      ) => {
        callCount = callCount + 1
        return Effect.succeed({
          name: 'Retried Plant',
          family: 'Testaceae',
          confidence: 0.88,
          alternatives: [],
          wateringFrequencyDays: 5,
          luxNeeded: 3000,
          humidityRating: 70,
          petToxicityRating: 10,
          fertilizationFrequencyDays: 14,
          category: 'Succulent',
          description: 'A retried plant',
          wateringTips: 'Water sparingly',
        })
      },
      plantChatStream: () => Effect.succeed({} as never),
      plantCardScan: () => Effect.succeed({} as never),
      plantCardScanMultiple: () => Effect.succeed({} as never),
    } as unknown as typeof AiService.Service)

    const result = await Effect.runPromise(
      aiIdentify([mockFile]).pipe(
        Effect.provide(
          Layer.mergeAll(
            aiServiceWithRetryTracking,
            createMockGCSService(),
            createMockFileService(),
            createMockFileSystem(),
            createMockCurrentUser({ id: 'user-1' }),
            MockLimitCheckerLive,
            MockUsageTrackerLive
          )
        )
      )
    )

    expect(callCount).toBe(1)
    expect(result.name).toBe('Retried Plant')
  })
})
