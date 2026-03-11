import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { assertPlantAccess, PlantNotFound } from '@lily/mcp/auth/plant-access'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const mockPlant = {
  id: 'plant-1',
  name: 'Monstera',
  description: 'A tropical plant',
  imageUrl: null,
  category: 'tropical',
  dateAdded: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  humidityRating: 4,
  lightingRating: 3,
  petToxicityRating: 2,
  wateringRating: 3,
  health: 'HEALTHY' as const,
  userId: 'user-1',
  roomId: null,
  remindersEnabled: true,
  isFavorite: false,
}

describe('assertPlantAccess', () => {
  it('should return plant when user owns it', async () => {
    const layer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: [mockPlant] })
    )

    const result = await Effect.runPromise(
      assertPlantAccess('plant-1').pipe(Effect.provide(layer))
    )

    expect(result.id).toBe('plant-1')
    expect(result.name).toBe('Monstera')
  })

  it('should fail with PlantNotFound for non-existent plant', async () => {
    const layer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: [mockPlant] })
    )

    const exit = await Effect.runPromiseExit(
      assertPlantAccess('nonexistent').pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause
      // PlantNotFound is the tagged error
      expect(String(error)).toContain('PlantNotFound')
    }
  })

  it('should fail with PlantNotFound when plant belongs to another user', async () => {
    const otherUsersPlant = {
      ...mockPlant,
      id: 'plant-other',
      userId: 'user-2',
    }

    const layer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: [otherUsersPlant] })
    )

    const exit = await Effect.runPromiseExit(
      assertPlantAccess('plant-other').pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('should work with catchTag for PlantNotFound', async () => {
    const layer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: [] })
    )

    const result = await Effect.runPromise(
      assertPlantAccess('nonexistent').pipe(
        Effect.catchTag('PlantNotFound', () => Effect.succeed('handled')),
        Effect.provide(layer)
      )
    )

    expect(result).toBe('handled')
  })
})
