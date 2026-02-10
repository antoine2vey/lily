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
import { scanCard } from '@lily/api/services/plants/endpoints/scan-card'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('scanCard', () => {
  const mockFile = {
    _tag: 'PersistedFile',
    key: 'file',
    name: 'plant-card.jpg',
    contentType: 'image/jpeg',
    path: '/tmp/plant-card.jpg',
  } as unknown as PersistedFile

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

  it('should parse nursery card and return plant data', async () => {
    const result = await Effect.runPromise(
      scanCard([mockFile]).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
    expect(result.name).toBe('Mock Plant')
    expect(result.description).toBe('A mock plant description')
  })

  it('should record scan for achievement tracking', async () => {
    const result = await Effect.runPromise(
      scanCard([mockFile]).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
  })

  it('should publish PlantScanned event', async () => {
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

    await Effect.runPromise(scanCard([mockFile]).pipe(Effect.provide(layer)))

    expect(publishedEvents.length).toBe(1)
    expect(publishedEvents[0]).toMatchObject({
      _tag: 'PlantScanned',
      userId: 'user-1',
    })
  })

  it('should return plant care ratings from AI', async () => {
    const result = await Effect.runPromise(
      scanCard([mockFile]).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.humidityRating).toBe(50)
    expect(result.petToxicityRating).toBe(20)
    expect(result.luxNeeded).toBe(2000)
    expect(result.confidence).toBe(0.85)
    expect(result.imageUrl).toBeDefined()
  })
})
