import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  fertilizationSpec,
  type TestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { readCareScheduleResource } from '@lily/mcp/resources/care-schedule'
import { Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('readCareScheduleResource', () => {
  const referenceDate = new Date('2024-06-15T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(referenceDate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return valid JSON with overdue, today, and upcoming', async () => {
    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockUserRepository([mockUser1]),
      createMockPlantRepository({ plants: [] }),
      createMockCareScheduleRepository({})
    )

    const result = await Effect.runPromise(
      readCareScheduleResource().pipe(Effect.provide(testLayer))
    )

    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty('overdue')
    expect(parsed).toHaveProperty('today')
    expect(parsed).toHaveProperty('upcoming')
  })

  it('should return empty arrays when no tasks', async () => {
    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockUserRepository([mockUser1]),
      createMockPlantRepository({ plants: [] }),
      createMockCareScheduleRepository({})
    )

    const result = await Effect.runPromise(
      readCareScheduleResource().pipe(Effect.provide(testLayer))
    )

    const parsed = JSON.parse(result)
    expect(parsed.overdue).toEqual([])
    expect(parsed.today).toEqual([])
    expect(parsed.upcoming).toEqual([])
  })

  it('should include task details in overdue section', async () => {
    const overduePlants: TestPlant[] = [
      {
        id: 'plant-overdue',
        name: 'Thirsty Plant',
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
            frequencyDays: 7,
            lastCareAt: new Date('2024-06-01'),
            nextCareAt: new Date('2024-06-08'),
          }),
        ],
      },
    ]

    const schedules = schedulesFromPlants(overduePlants)

    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockUserRepository([mockUser1]),
      createMockPlantRepository({ plants: overduePlants }),
      createMockCareScheduleRepository({ schedules, plants: overduePlants })
    )

    const result = await Effect.runPromise(
      readCareScheduleResource().pipe(Effect.provide(testLayer))
    )

    const parsed = JSON.parse(result)
    expect(parsed.overdue).toHaveLength(1)
    expect(parsed.overdue[0].plantName).toBe('Thirsty Plant')
    expect(parsed.overdue[0].plantId).toBe('plant-overdue')
    expect(parsed.overdue[0].type).toBe('water')
    expect(parsed.overdue[0].dueDate).toBeDefined()
  })

  it('should format task dates as ISO strings', async () => {
    const plants: TestPlant[] = [
      {
        id: 'plant-date-test',
        name: 'Date Test Plant',
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
            frequencyDays: 7,
            lastCareAt: new Date('2024-06-08'),
            nextCareAt: new Date('2024-06-10'),
          }),
        ],
      },
    ]

    const schedules = schedulesFromPlants(plants)

    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockUserRepository([mockUser1]),
      createMockPlantRepository({ plants }),
      createMockCareScheduleRepository({ schedules, plants })
    )

    const result = await Effect.runPromise(
      readCareScheduleResource().pipe(Effect.provide(testLayer))
    )

    const parsed = JSON.parse(result)
    // Task dates should be valid ISO strings
    const allTasks = [...parsed.overdue, ...parsed.today, ...parsed.upcoming]
    for (const task of allTasks) {
      expect(() => new Date(task.dueDate)).not.toThrow()
      expect(task.dueDate).toContain('T')
    }
  })
})
