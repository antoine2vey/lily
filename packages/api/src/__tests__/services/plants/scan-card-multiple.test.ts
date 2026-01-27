import type { PersistedFile } from '@effect/platform/Multipart'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockScanRepository } from '@lily/api/__tests__/mocks/scan.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockUsageTrackerLive } from '@lily/api/__tests__/mocks/usage-tracker'
import type { AppEvent } from '@lily/api/events'
import { scanCardMultiple } from '@lily/api/services/plants/endpoints/scan-card-multiple'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('scanCardMultiple', () => {
  const createMockFile = (name: string): PersistedFile =>
    ({
      _tag: 'PersistedFile',
      key: 'images',
      name,
      contentType: 'image/jpeg',
      path: `/tmp/${name}`,
    }) as unknown as PersistedFile

  const createTestLayer = () =>
    Layer.mergeAll(
      createMockAiService(),
      createMockGCSService(),
      createMockFileService(),
      createMockFileSystem(),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' }),
      createMockScanRepository(),
      MockLimitCheckerLive,
      MockUsageTrackerLive
    )

  it('should return a single result from multiple images', async () => {
    const files = [createMockFile('card1.jpg'), createMockFile('card2.jpg')]

    const result = await Effect.runPromise(
      scanCardMultiple(files).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.name).toBe('Mock Plant')
    expect(result.confidence).toBe(0.92)
    expect(result.imageUrl).toBeDefined()
  })

  it('should work with a single image', async () => {
    const files = [createMockFile('card1.jpg')]

    const result = await Effect.runPromise(
      scanCardMultiple(files).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.name).toBe('Mock Plant')
    expect(result.imageUrl).toBeDefined()
  })

  it('should publish a single PlantScanned event', async () => {
    const publishedEvents: AppEvent[] = []
    const layer = Layer.mergeAll(
      createMockAiService(),
      createMockGCSService(),
      createMockFileService(),
      createMockFileSystem(),
      createMockEventBus({ publishedEvents }),
      createMockCurrentUser({ id: 'user-1' }),
      createMockScanRepository(),
      MockLimitCheckerLive,
      MockUsageTrackerLive
    )

    const files = [createMockFile('card1.jpg'), createMockFile('card2.jpg')]
    await Effect.runPromise(scanCardMultiple(files).pipe(Effect.provide(layer)))

    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toMatchObject({
      _tag: 'PlantScanned',
      userId: 'user-1',
    })
  })

  it('should use first uploaded image URL as imageUrl', async () => {
    const files = [createMockFile('card1.jpg'), createMockFile('card2.jpg')]

    const result = await Effect.runPromise(
      scanCardMultiple(files).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.imageUrl).toContain('https://')
  })
})
