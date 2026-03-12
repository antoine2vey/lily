import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { listPlantsEffect } from '@lily/mcp/tools/list-plants'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const mockPlant = {
  id: 'plant-1',
  name: 'Monstera',
  description: 'A tropical plant',
  imageUrl: 'https://example.com/monstera.jpg',
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

describe('listPlants MCP tool', () => {
  const testLayer = Layer.mergeAll(
    createMockCurrentUser({ id: 'user-1' }),
    createMockUserRepository([mockUser1]),
    createMockPlantRepository({
      plants: [mockPlant],
    })
  )

  it('should return markdown list of plants', async () => {
    const result = await Effect.runPromise(
      listPlantsEffect({ filter: 'all' }).pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('Your Plants')
    expect(result.text).toContain('Monstera')
    expect(result.text).toContain('[Healthy]')
    expect(result.text).toContain('plant-1')
  })

  it('should return friendly message when no plants', async () => {
    const emptyLayer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockUserRepository([mockUser1]),
      createMockPlantRepository({ plants: [] })
    )

    const result = await Effect.runPromise(
      listPlantsEffect({ filter: 'all' }).pipe(Effect.provide(emptyLayer))
    )

    expect(result.text).toContain('no plants yet')
  })
})
