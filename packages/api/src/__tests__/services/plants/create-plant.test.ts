import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockSession } from '@lily/api/__tests__/mocks/session'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('createPlant', () => {
  const validRequest = {
    name: 'New Plant',
    description: 'A new plant description',
    category: 'tropical',
    wateringFrequencyDays: 7,
    sunlightPreference: 'indirect',
    humidityRating: 3,
    petToxicityRating: 1,
  }

  const createTestLayer = () =>
    Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockEventBus(),
      createMockSession({ userId: 'user-1' })
    )

  it('should create a new plant', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.name).toBe('New Plant')
    expect(result.id).toBeDefined()
  })

  it('should return the created plant with an id', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.id).toBeTruthy()
    expect(typeof result.id).toBe('string')
  })

  it('should set default health to HEALTHY', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.health).toBe('HEALTHY')
  })

  it('should handle optional description', async () => {
    const requestWithoutDescription = {
      ...validRequest,
      description: undefined,
    }

    const result = await Effect.runPromise(
      createPlant(requestWithoutDescription).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.description).toBeNull()
  })

  it('should set watering frequency correctly', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.wateringFrequencyDays).toBe(7)
  })

  it('should publish PlantCreated event', async () => {
    const publishedEvents: unknown[] = []
    const eventBusMock = createMockEventBus({ publishedEvents })

    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: mockPlants }),
            eventBusMock,
            createMockSession({ userId: 'user-1' })
          )
        )
      )
    )

    expect(publishedEvents.length).toBe(1)
    expect(publishedEvents[0]).toMatchObject({
      _tag: 'PlantCreated',
      userId: 'user-1',
      plantId: result.id,
    })
  })
})
