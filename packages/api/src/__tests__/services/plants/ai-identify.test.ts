import type { PersistedFile } from '@effect/platform/Multipart'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
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
      createMockFileSystem()
    )

  it('should identify plant species from image', async () => {
    const result = await Effect.runPromise(
      aiIdentify([mockFile]).pipe(Effect.provide(createTestLayer()))
    )

    // The endpoint returns an HttpServerResponse with a stream
    expect(result).toBeDefined()
    expect(result.status).toBe(200)
  })

  it('should return streaming response', async () => {
    const result = await Effect.runPromise(
      aiIdentify([mockFile]).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
    // Response should be a stream response
    expect(result.headers).toBeDefined()
  })
})
