import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type { AppEvent } from '@lily/api/events'
import { sharePlant } from '@lily/api/services/plants/endpoints/share-plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('sharePlant', () => {
  const createTestLayer = (publishedEvents: AppEvent[] = []) =>
    Layer.mergeAll(
      createMockEventBus({ publishedEvents }),
      createMockCurrentUser({ id: 'user-1' })
    )

  it('should publish PlantShared event with correct userId and plantId', async () => {
    const publishedEvents: AppEvent[] = []
    const layer = createTestLayer(publishedEvents)

    await Effect.runPromise(sharePlant('plant-123').pipe(Effect.provide(layer)))

    expect(publishedEvents.length).toBe(1)
    expect(publishedEvents[0]).toMatchObject({
      _tag: 'PlantShared',
      userId: 'user-1',
      plantId: 'plant-123',
    })
  })

  it('should use current user id from context', async () => {
    const publishedEvents: AppEvent[] = []
    const layer = Layer.mergeAll(
      createMockEventBus({ publishedEvents }),
      createMockCurrentUser({ id: 'different-user' })
    )

    await Effect.runPromise(sharePlant('plant-456').pipe(Effect.provide(layer)))

    expect(publishedEvents[0]).toMatchObject({
      _tag: 'PlantShared',
      userId: 'different-user',
      plantId: 'plant-456',
    })
  })
})
