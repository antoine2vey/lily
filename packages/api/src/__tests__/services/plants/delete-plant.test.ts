import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { deletePlant } from '@lily/api/services/plants/endpoints/delete-plant'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('deletePlant', () => {
  it('should delete existing plant', async () => {
    const result = await Effect.runPromise(
      deletePlant({ id: 'plant-1' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.id).toBe('plant-1')
  })

  it('should return the deleted plant', async () => {
    const result = await Effect.runPromise(
      deletePlant({ id: 'plant-1' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result).toEqual({ ...mockPlants[0], room: null })
  })

  it('should fail with PlantNotFoundError when plant not found', async () => {
    const result = await Effect.runPromiseExit(
      deletePlant({ id: 'non-existent' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: [] }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return correct plant data on deletion', async () => {
    const result = await Effect.runPromise(
      deletePlant({ id: 'plant-2' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.id).toBe('plant-2')
    expect(result.name).toBe('Snake Plant')
  })
})
