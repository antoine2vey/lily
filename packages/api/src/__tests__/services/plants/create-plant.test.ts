import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('createPlant', () => {
  const validRequest = {
    name: 'New Plant',
    description: 'A new plant description',
    category: 'tropical',
    wateringFrequencyDays: 7,
    sunlightPreference: 'indirect',
    humidityRating: 3,
    petToxicityRating: 1,
  }

  it('should create a new plant', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.name).toBe('New Plant')
    expect(result.id).toBeDefined()
  })

  it('should return the created plant with an id', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.id).toBeTruthy()
    expect(typeof result.id).toBe('string')
  })

  it('should set default health to HEALTHY', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.health).toBe('HEALTHY')
  })

  it('should handle optional description', async () => {
    const requestWithoutDescription = {
      ...validRequest,
      description: undefined,
    }

    const result = await Effect.runPromise(
      createPlant(requestWithoutDescription).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.description).toBeNull()
  })

  it('should set watering frequency correctly', async () => {
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(
        Effect.provide(createMockPlantRepository({ plants: mockPlants }))
      )
    )

    expect(result.wateringFrequencyDays).toBe(7)
  })
})
