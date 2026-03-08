import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type { AppEvent } from '@lily/api/events'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { Array, Effect, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const findSchedule = (
  schedules: CareScheduleRow[],
  plantId: string,
  careType: string
) =>
  pipe(
    Array.findFirst(
      schedules,
      (s) => s.plantId === plantId && s.careType === careType
    ),
    Option.getOrNull
  )

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

  const createTestLayer = () => {
    const schedules: CareScheduleRow[] = []
    return {
      layer: Layer.mergeAll(
        createMockPlantRepository({ plants: mockPlants }),
        createMockEventBus(),
        createMockCurrentUser({ id: 'user-1' }),
        MockLimitCheckerLive,
        createMockCareScheduleRepository({ schedules })
      ),
      schedules,
    }
  }

  it('should create a new plant', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.name).toBe('New Plant')
    expect(result.id).toBeDefined()
  })

  it('should return the created plant with an id', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.id).toBeTruthy()
    expect(typeof result.id).toBe('string')
  })

  it('should set default health to HEALTHY', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.health).toBe('HEALTHY')
  })

  it('should handle optional description', async () => {
    const requestWithoutDescription = {
      ...validRequest,
      description: undefined,
    }

    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(requestWithoutDescription).pipe(Effect.provide(layer))
    )

    expect(result.description).toBeNull()
  })

  it('should set watering frequency correctly', async () => {
    const { layer, schedules } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    const wateringSchedule = findSchedule(schedules, result.id, 'watering')
    expect(wateringSchedule?.frequencyDays).toBe(7)
  })

  it('should set imageUrl when provided', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant({
        ...validRequest,
        imageUrl: 'https://example.com/plant.jpg',
      }).pipe(Effect.provide(layer))
    )

    expect(result.imageUrl).toBe('https://example.com/plant.jpg')
  })

  it('should set fertilizationFrequencyDays when provided', async () => {
    const { layer, schedules } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant({
        ...validRequest,
        fertilizationFrequencyDays: 14,
      }).pipe(Effect.provide(layer))
    )

    const fertSchedule = findSchedule(schedules, result.id, 'fertilization')
    expect(fertSchedule?.frequencyDays).toBe(14)
  })

  it('should default imageUrl to null when not provided', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.imageUrl).toBeNull()
  })

  it('should default fertilizationFrequencyDays to null when not provided', async () => {
    const { layer, schedules } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    const fertSchedule = findSchedule(schedules, result.id, 'fertilization')
    expect(fertSchedule).toBeNull()
  })

  it('should convert luxNeeded to lightingRating', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant({ ...validRequest, luxNeeded: 5000 }).pipe(
        Effect.provide(layer)
      )
    )

    // 5000 lux → level 4 (direct light)
    expect(result.lightingRating).toBe(4)
  })

  it('should set lightingRating 1 for low lux', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant({ ...validRequest, luxNeeded: 200 }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.lightingRating).toBe(1)
  })

  it('should publish PlantCreated event', async () => {
    const publishedEvents: AppEvent[] = []
    const schedules: CareScheduleRow[] = []
    const eventBusMock = createMockEventBus({ publishedEvents })

    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: mockPlants }),
            eventBusMock,
            createMockCurrentUser({ id: 'user-1' }),
            MockLimitCheckerLive,
            createMockCareScheduleRepository({ schedules })
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
