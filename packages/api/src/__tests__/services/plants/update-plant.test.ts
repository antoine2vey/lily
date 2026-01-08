import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('updatePlant', () => {
  it('should update plant fields', async () => {
    const result = await Effect.runPromise(
      updatePlant({ id: 'plant-1', name: 'Updated Name' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.name).toBe('Updated Name')
  })

  it('should fail with PlantNotFoundError when plant not found', async () => {
    const result = await Effect.runPromiseExit(
      updatePlant({ id: 'non-existent', name: 'Test' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: [] }))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should preserve other fields when updating', async () => {
    const result = await Effect.runPromise(
      updatePlant({ id: 'plant-1', name: 'Updated Name' }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.category).toBe(mockPlants[0]?.category)
    expect(result.id).toBe('plant-1')
  })

  it('should update multiple fields at once', async () => {
    const result = await Effect.runPromise(
      updatePlant({
        id: 'plant-1',
        name: 'Updated Name',
        description: 'Updated description',
        wateringFrequencyDays: 14,
      }).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.name).toBe('Updated Name')
    expect(result.description).toBe('Updated description')
    expect(result.wateringFrequencyDays).toBe(14)
  })

  it('should update health status', async () => {
    const result = await Effect.runPromise(
      updatePlant({ id: 'plant-1', health: 'THRIVING' } as Parameters<typeof updatePlant>[0]).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.health).toBe('THRIVING')
  })
})
