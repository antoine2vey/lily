import type { PersistedFile } from '@effect/platform/Multipart'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type { AppEvent } from '@lily/api/events'
import { uploadPlantPhoto } from '@lily/api/services/plants/endpoints/upload-plant-photo'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('uploadPlantPhoto', () => {
  const mockFile = {
    _tag: 'PersistedFile',
    key: 'file',
    name: 'test-photo.jpg',
    contentType: 'image/jpeg',
    path: '/tmp/test-photo.jpg',
  } as unknown as PersistedFile

  const createTestLayer = () =>
    Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockGCSService(),
      createMockFileSystem(),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' })
    )

  it('returns the persisted photos so the client can reconcile', async () => {
    const result = await Effect.runPromise(
      uploadPlantPhoto({ plantId: 'plant-1', files: [mockFile] }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.photos).toHaveLength(1)
    expect(result.photos[0]).toMatchObject({ plantId: 'plant-1' })
    expect(typeof result.photos[0]?.id).toBe('string')
    expect(typeof result.photos[0]?.url).toBe('string')
  })

  it('should publish PhotoUploaded event for each photo', async () => {
    const publishedEvents: AppEvent[] = []
    const layer = Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockGCSService(),
      createMockFileSystem(),
      createMockEventBus({ publishedEvents }),
      createMockCurrentUser({ id: 'user-1' })
    )

    await Effect.runPromise(
      uploadPlantPhoto({ plantId: 'plant-1', files: [mockFile] }).pipe(
        Effect.provide(layer)
      )
    )

    expect(publishedEvents.length).toBe(1)
    expect(publishedEvents[0]).toMatchObject({
      _tag: 'PhotoUploaded',
      userId: 'user-1',
      plantId: 'plant-1',
    })
  })

  it('should publish multiple PhotoUploaded events for multiple photos', async () => {
    const publishedEvents: AppEvent[] = []
    const layer = Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockGCSService(),
      createMockFileSystem(),
      createMockEventBus({ publishedEvents }),
      createMockCurrentUser({ id: 'user-1' })
    )

    const files: PersistedFile[] = [
      { ...mockFile, name: 'photo1.jpg' },
      { ...mockFile, name: 'photo2.jpg' },
    ]

    await Effect.runPromise(
      uploadPlantPhoto({ plantId: 'plant-1', files }).pipe(
        Effect.provide(layer)
      )
    )

    expect(publishedEvents.length).toBe(2)
    expect(
      Array.every(publishedEvents, (e) => e._tag === 'PhotoUploaded')
    ).toBe(true)
  })

  it('returns an empty photo list for an empty files array', async () => {
    const result = await Effect.runPromise(
      uploadPlantPhoto({ plantId: 'plant-1', files: [] }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.photos).toHaveLength(0)
  })
})
