import {
  mockPlantsForCareTasks,
  mockPlantsNoCare,
} from '@lily/api/__tests__/fixtures/care-tasks'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { findCareTasks } from '@lily/api/services/care-tasks/endpoints/find-care-tasks'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Helper to create test layer with CurrentUser
const createTestLayer = (userId = 'user-1', plants = mockPlantsForCareTasks) =>
  Layer.mergeAll(
    createMockPlantRepository({ plants }),
    createMockCurrentUser({ id: userId })
  )

describe('findCareTasks', () => {
  it('should return tasks grouped by overdue, today, and thisWeek', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    expect(result.overdue).toBeDefined()
    expect(result.today).toBeDefined()
    expect(result.thisWeek).toBeDefined()
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

  it('should include this week fertilization tasks', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // plant-1 has nextFertilizationAt = tomorrow (this week)
    const weekFertilize = Array.findFirst(
      result.thisWeek,
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
        Effect.provide(createTestLayer('user-1', mockPlantsNoCare))
      )
    )

    expect(result.overdue).toEqual([])
    expect(result.today).toEqual([])
    expect(result.thisWeek).toEqual([])
  })

  it('should generate correct task IDs', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // Check that task IDs follow the format plantId-type
    const allTasks = [...result.overdue, ...result.today, ...result.thisWeek]
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

    const allTasks = [...result.overdue, ...result.today, ...result.thisWeek]
    expect(Array.every(allTasks, (t) => t.completed === false)).toBe(true)
  })

  it('should not include tasks beyond this week', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // plant-4 has nextWateringAt = nextWeek (beyond this week)
    const allTasks = [...result.overdue, ...result.today, ...result.thisWeek]
    const futureTask = Array.findFirst(allTasks, (t) => t.plantId === 'plant-4')

    expect(futureTask._tag).toBe('None')
  })

  it('should sort tasks by due date within each group', async () => {
    const result = await Effect.runPromise(
      findCareTasks().pipe(Effect.provide(createTestLayer()))
    )

    // Check thisWeek is sorted by dueDate
    if (result.thisWeek.length > 1) {
      Array.forEach(
        Array.zip(
          Array.take(result.thisWeek, result.thisWeek.length - 1),
          Array.drop(result.thisWeek, 1)
        ),
        ([prev, curr]) => {
          expect(prev.dueDate.getTime()).toBeLessThanOrEqual(
            curr.dueDate.getTime()
          )
        }
      )
    }
  })
})
