import {
  mockPlantPhotos,
  mockPlants,
} from '@lily/api/__tests__/fixtures/plants'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { getPlantPhotos } from '@lily/api/services/plants/endpoints/get-plant-photos'
import { Array, Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getPlantPhotos', () => {
  const createTestLayer = () =>
    createMockPlantRepository({ plants: mockPlants, photos: mockPlantPhotos })

  it('should return photos for a plant with pagination info', async () => {
    const result = await Effect.runPromise(
      getPlantPhotos({ plantId: 'plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(2)
    expect(
      Array.every(result.items, (photo) => photo.plantId === 'plant-1')
    ).toBe(true)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should return empty array for plant with no photos', async () => {
    const result = await Effect.runPromise(
      getPlantPhotos({ plantId: 'plant-2' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should respect pagination parameters', async () => {
    const result = await Effect.runPromise(
      getPlantPhotos({ plantId: 'plant-1', page: 1, limit: 1 }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(1)
    expect(result.total).toBe(2)
    expect(result.hasMore).toBe(true)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(1)
  })

  it('should return second page correctly', async () => {
    const result = await Effect.runPromise(
      getPlantPhotos({ plantId: 'plant-1', page: 2, limit: 1 }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(1)
    expect(result.page).toBe(2)
    expect(result.hasMore).toBe(false)
  })

  it('should include photo metadata', async () => {
    const result = await Effect.runPromise(
      getPlantPhotos({ plantId: 'plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const photo = result.items[0]
    expect(photo).toBeDefined()
    expect(photo?.id).toBeDefined()
    expect(photo?.url).toBeDefined()
    expect(photo?.takenAt).toBeDefined()
    expect(photo?.plantId).toBe('plant-1')
  })
})
