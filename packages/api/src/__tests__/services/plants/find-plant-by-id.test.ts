import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { findPlantById } from '@lily/api/services/plants/endpoints/find-plant-by-id'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('findPlantById', () => {
  it('should return plant when found', async () => {
    const result = await Effect.runPromise(
      findPlantById({ id: 'plant-1' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    // Result includes plant data plus photos array
    expect(result).toEqual({
      ...mockPlants[0],
      photos: [],
    })
  })

  it('should fail with PlantNotFoundError when plant not found', async () => {
    const result = await Effect.runPromiseExit(
      findPlantById({ id: 'non-existent' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when store is empty', async () => {
    const result = await Effect.runPromiseExit(
      findPlantById({ id: 'any-id' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: [] }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return correct plant for given id', async () => {
    const result = await Effect.runPromise(
      findPlantById({ id: 'plant-2' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.id).toBe('plant-2')
    expect(result.name).toBe('Snake Plant')
  })
})
