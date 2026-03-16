import {
  mockPlantPhotos,
  mockPlants,
} from '@lily/api/__tests__/fixtures/plants'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { findPlantById } from '@lily/api/services/plants/endpoints/find-plant-by-id'
import { Effect, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const toPlantWithRoom = (
  plant: (typeof mockPlants)[number]
): PlantWithRoom => ({
  ...plant,
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: [],
})

describe('findPlantById (with photos)', () => {
  it('should return plant with photos array when plant exists', async () => {
    const layer = createMockPlantRepository({
      plants: mockPlants,
      photos: mockPlantPhotos,
    })

    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      pipe(findPlantById(plant), Effect.provide(layer))
    )

    expect(result.id).toBe('plant-1')
    expect(result.name).toBe('Monstera Deliciosa')
    expect(result.photos).toBeDefined()
    expect(result.photos).toHaveLength(2)
    expect(result.photos[0]?.id).toBe('photo-1')
    expect(result.photos[0]?.url).toBe('https://example.com/photo1.jpg')
    expect(result.photos[1]?.id).toBe('photo-2')
  })

  it('should return empty photos array when plant has no photos', async () => {
    const layer = createMockPlantRepository({
      plants: mockPlants,
      photos: [],
    })

    const plant = toPlantWithRoom(mockPlants[1]!)
    const result = await Effect.runPromise(
      pipe(findPlantById(plant), Effect.provide(layer))
    )

    expect(result.id).toBe('plant-2')
    expect(result.name).toBe('Snake Plant')
    expect(result.photos).toBeDefined()
    expect(result.photos).toHaveLength(0)
  })

  it('should limit photos to 10 most recent', async () => {
    const manyPhotos = Array.from({ length: 15 }, (_, i) => ({
      id: `photo-${i + 1}`,
      url: `https://example.com/photo${i + 1}.jpg`,
      takenAt: new Date(`2024-01-${String(i + 1).padStart(2, '0')}`),
      plantId: 'plant-1',
    }))

    const layer = createMockPlantRepository({
      plants: mockPlants,
      photos: manyPhotos,
    })

    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      pipe(findPlantById(plant), Effect.provide(layer))
    )

    expect(result.photos).toBeDefined()
    expect(result.photos).toHaveLength(10)
  })
})
