import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  type TestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { getOverduePlantsEffect } from '@lily/mcp/tools/get-overdue-plants'
import { Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('getOverduePlants MCP tool', () => {
  const referenceDate = new Date('2024-06-15T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(referenceDate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return friendly message when no plants are overdue', async () => {
    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1', timezone: 'UTC' }),
      createMockPlantRepository({ plants: [] }),
      createMockCareScheduleRepository({})
    )

    const result = await Effect.runPromise(
      getOverduePlantsEffect().pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('No overdue plants')
    expect(result.text).toContain('on schedule')
  })

  it('should list overdue plants with schedule info', async () => {
    const yesterday = new Date(referenceDate)
    yesterday.setDate(yesterday.getDate() - 3)

    const plants: TestPlant[] = [
      {
        id: 'plant-overdue-1',
        name: 'Thirsty Fern',
        description: null,
        imageUrl: null,
        category: 'tropical',
        dateAdded: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        humidityRating: 4,
        lightingRating: 3,
        petToxicityRating: 2,
        wateringRating: 3,
        health: 'HEALTHY',
        roomId: null,
        userId: 'user-1',
        remindersEnabled: true,
        isFavorite: false,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: new Date('2024-06-05'),
            nextCareAt: yesterday,
          }),
        ],
      },
    ]

    const schedules = schedulesFromPlants(plants)

    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1', timezone: 'UTC' }),
      createMockPlantRepository({ plants, schedules }),
      createMockCareScheduleRepository({ schedules, plants })
    )

    const result = await Effect.runPromise(
      getOverduePlantsEffect().pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('Overdue Plants')
    expect(result.text).toContain('Thirsty Fern')
    expect(result.text).toContain('plant-overdue-1')
  })

  it('should show plant count in heading', async () => {
    const overduePlants: TestPlant[] = [
      {
        id: 'plant-od-1',
        name: 'Fern A',
        description: null,
        imageUrl: null,
        category: 'tropical',
        dateAdded: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        humidityRating: 3,
        lightingRating: 3,
        petToxicityRating: 0,
        wateringRating: 3,
        health: 'HEALTHY',
        roomId: null,
        userId: 'user-1',
        remindersEnabled: true,
        isFavorite: false,
        scheduleSpecs: [
          wateringSpec({
            nextCareAt: new Date('2024-06-10'),
          }),
        ],
      },
      {
        id: 'plant-od-2',
        name: 'Fern B',
        description: null,
        imageUrl: null,
        category: 'tropical',
        dateAdded: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        humidityRating: 3,
        lightingRating: 3,
        petToxicityRating: 0,
        wateringRating: 3,
        health: 'HEALTHY',
        roomId: null,
        userId: 'user-1',
        remindersEnabled: true,
        isFavorite: false,
        scheduleSpecs: [
          wateringSpec({
            nextCareAt: new Date('2024-06-12'),
          }),
        ],
      },
    ]

    const schedules = schedulesFromPlants(overduePlants)

    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1', timezone: 'UTC' }),
      createMockPlantRepository({ plants: overduePlants, schedules }),
      createMockCareScheduleRepository({ schedules, plants: overduePlants })
    )

    const result = await Effect.runPromise(
      getOverduePlantsEffect().pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('Overdue Plants (2)')
  })

  it('should not show other users plants', async () => {
    const plants: TestPlant[] = [
      {
        id: 'plant-other-user',
        name: 'Other User Plant',
        description: null,
        imageUrl: null,
        category: 'tropical',
        dateAdded: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        humidityRating: 3,
        lightingRating: 3,
        petToxicityRating: 0,
        wateringRating: 3,
        health: 'HEALTHY',
        roomId: null,
        userId: 'user-2',
        remindersEnabled: true,
        isFavorite: false,
        scheduleSpecs: [
          wateringSpec({
            nextCareAt: new Date('2024-06-10'),
          }),
        ],
      },
    ]

    const schedules = schedulesFromPlants(plants)

    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1', timezone: 'UTC' }),
      createMockPlantRepository({ plants, schedules }),
      createMockCareScheduleRepository({ schedules, plants })
    )

    const result = await Effect.runPromise(
      getOverduePlantsEffect().pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('No overdue plants')
  })

  it('should show room info when plant has a room', async () => {
    const plants: TestPlant[] = [
      {
        id: 'plant-with-room',
        name: 'Room Fern',
        description: null,
        imageUrl: null,
        category: 'tropical',
        dateAdded: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        humidityRating: 3,
        lightingRating: 3,
        petToxicityRating: 0,
        wateringRating: 3,
        health: 'HEALTHY',
        roomId: 'room-1',
        userId: 'user-1',
        remindersEnabled: true,
        isFavorite: false,
        scheduleSpecs: [
          wateringSpec({
            nextCareAt: new Date('2024-06-10'),
          }),
        ],
      },
    ]

    const schedules = schedulesFromPlants(plants)

    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1', timezone: 'UTC' }),
      createMockPlantRepository({
        plants,
        schedules,
        rooms: [
          {
            id: 'room-1',
            name: 'Kitchen',
            icon: '🍳',
            luminosity: null,
            isOutdoor: false,
          },
        ],
      }),
      createMockCareScheduleRepository({ schedules, plants })
    )

    const result = await Effect.runPromise(
      getOverduePlantsEffect().pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('🍳 Kitchen')
  })
})
