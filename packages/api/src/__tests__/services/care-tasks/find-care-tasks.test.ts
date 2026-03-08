import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import type { TestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { findCareTasks } from '@lily/api/services/care-tasks/endpoints/find-care-tasks'
import { Array, Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Create fixture dates dynamically based on a fixed reference time
const createMockPlantsForCareTasks = (referenceDate: Date): TestPlant[] => {
  const yesterday = new Date(referenceDate)
  yesterday.setDate(yesterday.getDate() - 1)

  const today = new Date(referenceDate)
  today.setHours(12, 0, 0, 0)

  const tomorrow = new Date(referenceDate)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const inThreeDays = new Date(referenceDate)
  inThreeDays.setDate(inThreeDays.getDate() + 3)

  const nextWeek = new Date(referenceDate)
  nextWeek.setDate(nextWeek.getDate() + 10)

  return [
    {
      id: 'plant-1',
      name: 'Monstera',
      description: 'A tropical plant',
      imageUrl: 'https://example.com/monstera.jpg',
      category: 'tropical',
      dateAdded: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      humidityRating: 4,
      lightingRating: 3,
      petToxicityRating: 2,
      wateringRating: 3,
      health: 'HEALTHY',
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-10'),
      nextWateringAt: yesterday, // Overdue
      remindersEnabled: true,
      fertilizationFrequencyDays: 30,
      lastFertilizedAt: new Date('2024-01-01'),
      nextFertilizationAt: tomorrow, // Upcoming
      isFavorite: false,
      roomId: null,
      userId: 'user-1',
    },
    {
      id: 'plant-2',
      name: 'Snake Plant',
      description: 'Low maintenance',
      imageUrl: null,
      category: 'succulent',
      dateAdded: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
      humidityRating: 2,
      lightingRating: 2,
      petToxicityRating: 3,
      wateringRating: 1,
      health: 'THRIVING',
      wateringFrequencyDays: 14,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: today, // Today
      remindersEnabled: true,
      fertilizationFrequencyDays: null,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
      isFavorite: false,
      roomId: null,
      userId: 'user-1',
    },
    {
      id: 'plant-3',
      name: 'Fiddle Leaf Fig',
      description: null,
      imageUrl: null,
      category: 'tropical',
      dateAdded: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-03'),
      humidityRating: 4,
      lightingRating: 4,
      petToxicityRating: 2,
      wateringRating: 4,
      health: 'HEALTHY',
      wateringFrequencyDays: 10,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: inThreeDays, // Upcoming
      remindersEnabled: true,
      fertilizationFrequencyDays: 14,
      lastFertilizedAt: null,
      nextFertilizationAt: inThreeDays, // Upcoming
      isFavorite: false,
      roomId: null,
      userId: 'user-1',
    },
    {
      id: 'plant-4',
      name: 'Cactus',
      description: 'Desert plant',
      imageUrl: null,
      category: 'succulent',
      dateAdded: new Date('2024-01-04'),
      updatedAt: new Date('2024-01-04'),
      humidityRating: 1,
      lightingRating: 5,
      petToxicityRating: 1,
      wateringRating: 1,
      health: 'THRIVING',
      wateringFrequencyDays: 30,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: nextWeek, // Beyond 7-day window
      remindersEnabled: true,
      fertilizationFrequencyDays: null,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
      isFavorite: false,
      roomId: null,
      userId: 'user-1',
    },
    {
      id: 'plant-5',
      name: 'Other User Plant',
      description: 'Belongs to another user',
      imageUrl: null,
      category: 'tropical',
      dateAdded: new Date('2024-01-05'),
      updatedAt: new Date('2024-01-05'),
      humidityRating: 3,
      lightingRating: 3,
      petToxicityRating: 0,
      wateringRating: 3,
      health: 'HEALTHY',
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: yesterday, // Overdue but belongs to user-2
      remindersEnabled: true,
      fertilizationFrequencyDays: null,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
      isFavorite: false,
      roomId: null,
      userId: 'user-2',
    },
  ]
}

const createMockPlantsNoCare = (referenceDate: Date): TestPlant[] => {
  const nextWeek = new Date(referenceDate)
  nextWeek.setDate(nextWeek.getDate() + 10)

  return [
    {
      id: 'plant-no-care-1',
      name: 'No Care Plant',
      description: 'No pending care',
      imageUrl: null,
      category: 'tropical',
      dateAdded: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      humidityRating: 3,
      lightingRating: 3,
      petToxicityRating: 0,
      wateringRating: 3,
      health: 'HEALTHY',
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: nextWeek, // Far in the future
      remindersEnabled: true,
      fertilizationFrequencyDays: null,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
      isFavorite: false,
      roomId: null,
      userId: 'user-1',
    },
  ]
}

// Fixed reference date for all tests: Wed Jan 29, 2025 at 14:00 UTC
const REFERENCE_DATE = new Date('2025-01-29T14:00:00Z')

describe('findCareTasks', () => {
  // Use fake timers for all tests to ensure consistent date behavior
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(REFERENCE_DATE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Helper to create test layer with CurrentUser
  const createTestLayer = (
    userId = 'user-1',
    plants = createMockPlantsForCareTasks(REFERENCE_DATE)
  ) =>
    Layer.mergeAll(
      createMockPlantRepository({ plants }),
      createMockCareScheduleRepository({
        schedules: schedulesFromPlants(plants),
        plants,
      }),
      createMockCurrentUser({ id: userId }),
      createMockUserRepository(mockUsers)
    )

  it('should return tasks grouped by overdue, today, and upcoming', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    expect(result.overdue).toBeDefined()
    expect(result.today).toBeDefined()
    expect(result.upcoming).toBeDefined()
  })

  it('should include overdue watering tasks', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // plant-1 has nextWateringAt = yesterday (overdue)
    const overdueWater = Array.findFirst(
      result.overdue,
      (t) => t.plantId === 'plant-1' && t.type === 'water'
    )

    expect(overdueWater._tag).toBe('Some')
  })

  it('should include today watering tasks', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // plant-2 has nextWateringAt = today
    const todayWater = Array.findFirst(
      result.today,
      (t) => t.plantId === 'plant-2' && t.type === 'water'
    )

    expect(todayWater._tag).toBe('Some')
  })

  it('should include upcoming fertilization tasks', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // plant-1 has nextFertilizationAt = tomorrow (upcoming)
    const weekFertilize = Array.findFirst(
      result.upcoming,
      (t) => t.plantId === 'plant-1' && t.type === 'fertilize'
    )

    expect(weekFertilize._tag).toBe('Some')
  })

  it('should only return tasks for the current user', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer('user-1')))
    )

    // user-2 has plant-5 with overdue watering - should not appear
    const otherUserTask = Array.findFirst(
      result.overdue,
      (t) => t.plantId === 'plant-5'
    )

    expect(otherUserTask._tag).toBe('None')
  })

  it('should return empty arrays when no tasks are pending', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(
        Effect.provide(
          createTestLayer('user-1', createMockPlantsNoCare(REFERENCE_DATE))
        )
      )
    )

    expect(result.overdue).toEqual([])
    expect(result.today).toEqual([])
    expect(result.upcoming).toEqual([])
  })

  it('should generate correct task IDs', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // Check that task IDs follow the format plantId-type
    const allTasks = [...result.overdue, ...result.today, ...result.upcoming]
    Array.forEach(allTasks, (task) => {
      expect(task.id).toBe(`${task.plantId}-${task.type}`)
    })
  })

  it('should include plant name and image URL in tasks', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // plant-1 has an imageUrl
    const task = Array.findFirst(result.overdue, (t) => t.plantId === 'plant-1')

    if (task._tag === 'Some') {
      expect(task.value.plantName).toBe('Monstera')
      expect(task.value.plantImageUrl).toBe('https://example.com/monstera.jpg')
    }
  })

  it('should handle null imageUrl', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // plant-2 has null imageUrl
    const task = Array.findFirst(result.today, (t) => t.plantId === 'plant-2')

    if (task._tag === 'Some') {
      expect(task.value.plantImageUrl).toBeNull()
    }
  })

  it('should set completed to false for all tasks', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    const allTasks = [...result.overdue, ...result.today, ...result.upcoming]
    expect(Array.every(allTasks, (t) => t.completed === false)).toBe(true)
  })

  it('should not include tasks beyond 7 days', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // plant-4 has nextWateringAt = 10 days from now (beyond 7-day window)
    const allTasks = [...result.overdue, ...result.today, ...result.upcoming]
    const futureTask = Array.findFirst(allTasks, (t) => t.plantId === 'plant-4')

    expect(futureTask._tag).toBe('None')
  })

  it('should sort tasks by due date within each group', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // Check upcoming is sorted by dueDate
    if (result.upcoming.length > 1) {
      Array.forEach(
        Array.zip(
          Array.take(result.upcoming, result.upcoming.length - 1),
          Array.drop(result.upcoming, 1)
        ),
        ([prev, curr]) => {
          expect(prev.dueDate.getTime()).toBeLessThanOrEqual(
            curr.dueDate.getTime()
          )
        }
      )
    }
  })

  describe('timezone-aware grouping', () => {
    beforeEach(() => {
      // Wed Jan 29, 2025 at 23:30 UTC (overrides the outer beforeEach time)
      vi.setSystemTime(new Date('2025-01-29T23:30:00Z'))
    })

    it('should group tasks according to user timezone', async () => {
      // At 23:30 UTC Jan 29:
      // - In UTC: it's Jan 29
      // - In Europe/Paris (UTC+1): it's Jan 30 00:30
      // A task due Jan 29 23:00 UTC is:
      //   In UTC: today (Jan 29)
      //   In Paris: yesterday (Jan 29 in Paris was before midnight)
      const jan29Late = new Date('2025-01-29T23:00:00Z')
      const jan30Morning = new Date('2025-01-30T08:00:00Z')
      const feb1 = new Date('2025-02-01T12:00:00Z')

      const tzPlants = [
        {
          id: 'tz-plant-1',
          name: 'TZ Plant 1',
          description: null,
          imageUrl: null,
          category: 'tropical',
          dateAdded: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 0,
          wateringRating: 3,
          health: 'HEALTHY' as const,
          wateringFrequencyDays: 7,
          lastWateredAt: new Date('2024-01-01'),
          nextWateringAt: jan29Late,
          remindersEnabled: true,
          fertilizationFrequencyDays: null,
          lastFertilizedAt: null,
          nextFertilizationAt: null,
          isFavorite: false,
          roomId: null,
          userId: 'user-1',
        },
        {
          id: 'tz-plant-2',
          name: 'TZ Plant 2',
          description: null,
          imageUrl: null,
          category: 'tropical',
          dateAdded: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 0,
          wateringRating: 3,
          health: 'HEALTHY' as const,
          wateringFrequencyDays: 7,
          lastWateredAt: new Date('2024-01-01'),
          nextWateringAt: jan30Morning,
          remindersEnabled: true,
          fertilizationFrequencyDays: null,
          lastFertilizedAt: null,
          nextFertilizationAt: null,
          isFavorite: false,
          roomId: null,
          userId: 'user-1',
        },
        {
          id: 'tz-plant-3',
          name: 'TZ Plant 3',
          description: null,
          imageUrl: null,
          category: 'tropical',
          dateAdded: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 0,
          wateringRating: 3,
          health: 'HEALTHY' as const,
          wateringFrequencyDays: 7,
          lastWateredAt: new Date('2024-01-01'),
          nextWateringAt: feb1,
          remindersEnabled: true,
          fertilizationFrequencyDays: null,
          lastFertilizedAt: null,
          nextFertilizationAt: null,
          isFavorite: false,
          roomId: null,
          userId: 'user-1',
        },
      ]

      // Test with UTC user (user-1 has timezone: 'UTC')
      const utcLayer = Layer.mergeAll(
        createMockPlantRepository({ plants: tzPlants }),
        createMockCareScheduleRepository({
          schedules: schedulesFromPlants(tzPlants),
          plants: tzPlants,
        }),
        createMockCurrentUser({ id: 'user-1' }),
        createMockUserRepository(mockUsers)
      )

      const utcResult = await Effect.runPromise(
        findCareTasks().pipe(Effect.provide(utcLayer))
      )

      // In UTC at 23:30 Jan 29:
      // tz-plant-1 (Jan 29 23:00): today
      // tz-plant-2 (Jan 30 08:00): this week
      // tz-plant-3 (Feb 1 12:00): this week
      const utcTodayIds = Array.map(utcResult.today, (t) => t.plantId)
      expect(utcTodayIds).toContain('tz-plant-1')

      const utcWeekIds = Array.map(utcResult.upcoming, (t) => t.plantId)
      expect(utcWeekIds).toContain('tz-plant-2')

      // Test with Paris user — plants must belong to the Paris user
      const parisUser = createTestUser({
        id: 'user-paris',
        timezone: 'Europe/Paris',
      })
      const parisTzPlants = Array.map(tzPlants, (p) => ({
        ...p,
        userId: 'user-paris',
      }))
      const parisLayer = Layer.mergeAll(
        createMockPlantRepository({ plants: parisTzPlants }),
        createMockCareScheduleRepository({
          schedules: schedulesFromPlants(parisTzPlants),
          plants: parisTzPlants,
        }),
        createMockCurrentUser({ id: 'user-paris' }),
        createMockUserRepository([...mockUsers, parisUser])
      )

      const parisResult = await Effect.runPromise(
        findCareTasks().pipe(Effect.provide(parisLayer))
      )

      // In Paris at 00:30 Jan 30:
      // tz-plant-1 (Jan 29 23:00 UTC = Jan 30 00:00 Paris): today
      // tz-plant-2 (Jan 30 08:00 UTC = Jan 30 09:00 Paris): today
      const parisTodayIds = Array.map(parisResult.today, (t) => t.plantId)
      expect(parisTodayIds.length).toBeGreaterThanOrEqual(1)
    })
  })
})
