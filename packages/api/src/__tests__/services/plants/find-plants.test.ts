import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { findPlants } from '@lily/api/services/plants/endpoints/find-plants'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('findPlants', () => {
  it('should return plants with pagination info', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.plants).toBeDefined()
    expect(result.total).toBe(mockPlants.length)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(10)
  })

  it('should return empty array when no plants exist', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(
        Effect.provide(createMockPlantRepository({ plants: [] }))
      )
    )

    expect(result.plants).toEqual([])
    expect(result.total).toBe(0)
  })

  it('should respect page parameter', async () => {
    const result = await Effect.runPromise(
      findPlants({ page: 2, limit: 1 }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.page).toBe(2)
    expect(result.plants.length).toBeLessThanOrEqual(1)
  })

  it('should respect limit parameter', async () => {
    const result = await Effect.runPromise(
      findPlants({ limit: 2 }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.plants.length).toBe(2)
    expect(result.limit).toBe(2)
  })

  it('should filter by needsAttention', async () => {
    const result = await Effect.runPromise(
      findPlants({ filter: 'needsAttention' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.plants.every((p) => p.health === 'NEEDS_ATTENTION')).toBe(
      true
    )
  })

  it('should sort by name when specified', async () => {
    const result = await Effect.runPromise(
      findPlants({ sort: 'name' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    const names = result.plants.map((p) => p.name)
    const sortedNames = [...names].sort()
    expect(names).toEqual(sortedNames)
  })
})
