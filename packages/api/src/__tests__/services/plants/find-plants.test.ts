import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { findPlants } from '@lily/api/services/plants/endpoints/find-plants'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Helper to create test layer with CurrentUser
const createTestLayer = (userId = 'user-1') =>
  Layer.mergeAll(
    createMockPlantRepository({ plants: mockPlants }),
    createMockCurrentUser({ id: userId })
  )

describe('findPlants', () => {
  it('should return items with pagination info', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.items).toBeDefined()
    // user-1 has 2 plants (plant-1, plant-2)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should return only plants for the current user', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(Array.every(result.items, (p) => p.userId === 'user-1')).toBe(true)
    expect(result.total).toBe(2)
  })

  it('should return empty array when user has no plants', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(Effect.provide(createTestLayer('non-existent-user')))
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should respect page parameter', async () => {
    const result = await Effect.runPromise(
      findPlants({ page: 2, limit: 1 }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.page).toBe(2)
    expect(result.items.length).toBeLessThanOrEqual(1)
  })

  it('should respect limit parameter', async () => {
    const result = await Effect.runPromise(
      findPlants({ limit: 1 }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.items.length).toBe(1)
    expect(result.limit).toBe(1)
    // user-1 has 2 plants, so hasMore should be true with limit 1
    expect(result.hasMore).toBe(true)
  })

  it('should filter by needsAttention for current user only', async () => {
    // user-2 has the only NEEDS_ATTENTION plant
    const result = await Effect.runPromise(
      findPlants({ filter: 'needsAttention' }).pipe(
        Effect.provide(createTestLayer('user-2'))
      )
    )

    expect(
      Array.every(result.items, (p) => p.health === 'NEEDS_ATTENTION')
    ).toBe(true)
    expect(Array.every(result.items, (p) => p.userId === 'user-2')).toBe(true)
  })

  it('should return empty when filtering needsAttention but user has none', async () => {
    // user-1 has no NEEDS_ATTENTION plants
    const result = await Effect.runPromise(
      findPlants({ filter: 'needsAttention' }).pipe(
        Effect.provide(createTestLayer('user-1'))
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('should sort by name when specified', async () => {
    const result = await Effect.runPromise(
      findPlants({ sort: 'name' }).pipe(Effect.provide(createTestLayer()))
    )

    const names = Array.map(result.items, (p) => p.name)
    const sortedNames = [...names].sort()
    expect(names).toEqual(sortedNames)
  })
})
