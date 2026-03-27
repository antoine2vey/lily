import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { CurrentJwt } from '@lily/mcp/api-client'
import { listPlantsEffect } from '@lily/mcp/tools/list-plants'
import type { Plant } from '@lily/shared/plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const JWT = 'test-jwt'
const JwtLayer = Layer.succeed(CurrentJwt, JWT)

const mockPlant: Plant = {
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
  health: 'HEALTHY',
  remindersEnabled: true,
  isFavorite: false,
  userId: 'user-1',
  roomId: null,
  potWidthCm: null,
  potHeightCm: null,
  room: null,
  ownership: 'owned',
  ownerName: null,
  schedules: [],
}

describe('listPlants MCP tool', () => {
  it('should return markdown list of plants', async () => {
    const layer = createMockApiClient({
      listPlants: (_params) =>
        Effect.succeed({
          items: [mockPlant],
          hasMore: false,
          total: 1,
          page: 1,
          limit: 100,
        }),
    })

    const result = await Effect.runPromise(
      listPlantsEffect({ filter: 'all' }).pipe(
        Effect.provide(Layer.merge(layer, JwtLayer))
      )
    )

    expect(result.text).toContain('Your Plants')
    expect(result.text).toContain('Monstera')
    expect(result.text).toContain('[Healthy]')
    expect(result.text).toContain('plant-1')
  })

  it('should return friendly message when no plants', async () => {
    const layer = createMockApiClient()

    const result = await Effect.runPromise(
      listPlantsEffect({ filter: 'all' }).pipe(
        Effect.provide(Layer.merge(layer, JwtLayer))
      )
    )

    expect(result.text).toContain('no plants yet')
  })
})
