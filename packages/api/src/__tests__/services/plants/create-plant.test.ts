import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type { AppEvent } from '@lily/api/events'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('createPlant', () => {
  const validRequest = {
    name: 'New Plant',
    description: 'A new plant description',
    category: 'tropical',
    wateringFrequencyDays: 7,
    luxNeeded: 2000,
    humidityRating: 3,
    petToxicityRating: 1,
  }

  const createTestLayer = () =>
    Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' }),
      MockLimitCheckerLive
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

  it('should set imageUrl when provided', async () => {
    const result = await Effect.runPromise(
      createPlant({
        ...validRequest,
        imageUrl: 'https://example.com/plant.jpg',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.imageUrl).toBe('https://example.com/plant.jpg')
  })

  it('should set fertilizationFrequencyDays when provided', async () => {
    const result = await Effect.runPromise(
      createPlant({
        ...validRequest,
        fertilizationFrequencyDays: 14,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.fertilizationFrequencyDays).toBe(14)
  })

  it('should default imageUrl to null when not provided', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.imageUrl).toBeNull()
  })

  it('should default fertilizationFrequencyDays to null when not provided', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.fertilizationFrequencyDays).toBeNull()
  })

  it('should convert luxNeeded to lightingRating', async () => {
    const result = await Effect.runPromise(
      createPlant({ ...validRequest, luxNeeded: 5000 }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // 5000 lux → level 4 (direct light)
    expect(result.lightingRating).toBe(4)
  })

  it('should set lightingRating 1 for low lux', async () => {
    const result = await Effect.runPromise(
      createPlant({ ...validRequest, luxNeeded: 200 }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.lightingRating).toBe(1)
  })

  it('should publish PlantCreated event', async () => {
    const publishedEvents: AppEvent[] = []
    const eventBusMock = createMockEventBus({ publishedEvents })

    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: mockPlants }),
            eventBusMock,
            createMockCurrentUser({ id: 'user-1' }),
            MockLimitCheckerLive
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
