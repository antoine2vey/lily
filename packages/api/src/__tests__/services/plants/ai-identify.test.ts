import type { PersistedFile } from '@effect/platform/Multipart'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockUsageTrackerLive } from '@lily/api/__tests__/mocks/usage-tracker'
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
      aiIdentify([mockFile], 'en').pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
    expect(result.name).toBe('Mock Plant')
    expect(result.confidence).toBe(0.95)
    expect(result.imageUrl).toBeDefined()
  })
})
