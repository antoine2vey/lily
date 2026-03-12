import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  type TestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { getCareTasksEffect } from '@lily/mcp/tools/get-care-tasks'
import { Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('getCareTasks MCP tool', () => {
  const referenceDate = new Date('2024-06-15T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(referenceDate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return "no care tasks" when none pending', async () => {
    const testLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockUserRepository([mockUser1]),
      createMockPlantRepository({ plants: [] }),
      createMockCareScheduleRepository({})
    )

    const result = await Effect.runPromise(
      getCareTasksEffect().pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('No care tasks pending')
  })

  it('should show overdue tasks', async () => {
    const yesterday = new Date(referenceDate)
    yesterday.setDate(yesterday.getDate() - 1)

    const plants: TestPlant[] = [
      {
        id: 'plant-1',
        name: 'Overdue Fern',
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
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: new Date('2024-06-07'),
            nextCareAt: yesterday,
          }),
        ],
        remindersEnabled: true,
        isFavorite: false,
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
      getCareTasksEffect().pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('Care Tasks')
    expect(result.text).toContain('Overdue')
    expect(result.text).toContain('Overdue Fern')
  })
})
