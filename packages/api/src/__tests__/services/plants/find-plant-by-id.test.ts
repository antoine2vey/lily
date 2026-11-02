import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { withUserOwner } from '@lily/api/repositories/helpers/plant-owner'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { findPlantById } from '@lily/api/services/plants/endpoints/find-plant-by-id'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const toPlantWithRoom = (
  plant: (typeof mockPlants)[number]
): PlantWithRoom => ({
  ...withUserOwner(plant),
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: [],
})

describe('findPlantById', () => {
  it('should return plant when found', async () => {
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      findPlantById(plant).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result).toMatchObject({
      id: mockPlants[0]?.id,
      name: mockPlants[0]?.name,
      room: null,
      ownership: 'owned',
      ownerName: null,
      photos: [],
    })
  })

  it('should return correct plant for given id', async () => {
    const plant = toPlantWithRoom(mockPlants[1]!)
    const result = await Effect.runPromise(
      findPlantById(plant).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.id).toBe('plant-2')
    expect(result.name).toBe('Snake Plant')
  })
})
