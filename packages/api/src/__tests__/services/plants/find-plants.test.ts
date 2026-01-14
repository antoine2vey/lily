import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { findPlants } from '@lily/api/services/plants/endpoints/find-plants'
import { Array, Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('findPlants', () => {
  it('should return items with pagination info', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.items).toBeDefined()
    expect(result.total).toBe(mockPlants.length)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should return empty array when no plants exist', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(
        Effect.provide(createMockPlantRepository({ plants: [] }))
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should respect page parameter', async () => {
    const result = await Effect.runPromise(
      findPlants({ page: 2, limit: 1 }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.page).toBe(2)
    expect(result.items.length).toBeLessThanOrEqual(1)
  })

  it('should respect limit parameter', async () => {
    const result = await Effect.runPromise(
      findPlants({ limit: 2 }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.items.length).toBe(2)
    expect(result.limit).toBe(2)
    expect(result.hasMore).toBe(true)
  })

  it('should filter by needsAttention', async () => {
    const result = await Effect.runPromise(
      findPlants({ filter: 'needsAttention' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(
      Array.every(result.items, (p) => p.health === 'NEEDS_ATTENTION')
    ).toBe(true)
  })

  it('should sort by name when specified', async () => {
    const result = await Effect.runPromise(
      findPlants({ sort: 'name' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    const names = Array.map(result.items, (p) => p.name)
    const sortedNames = [...names].sort()
    expect(names).toEqual(sortedNames)
  })
})
