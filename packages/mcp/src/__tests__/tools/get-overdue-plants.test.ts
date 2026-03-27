import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { CurrentJwt } from '@lily/mcp/api-client'
import { getOverduePlantsEffect } from '@lily/mcp/tools/get-overdue-plants'
import type { Plant } from '@lily/shared/plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const JWT = 'test-jwt'
const JwtLayer = Layer.succeed(CurrentJwt, JWT)

const mockOverduePlant: Plant = {
  id: 'plant-overdue-1',
  name: 'Thirsty Fern',
  description: null,
  imageUrl: null,
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
  schedules: [
    {
      careType: 'watering',
      frequencyDays: 7,
      lastCareAt: new Date('2024-06-05'),
      nextCareAt: new Date('2024-06-12'),
    },
  ],
}

describe('getOverduePlants MCP tool', () => {
  it('should return overdue plants with schedule info', async () => {
    const layer = createMockApiClient({
      listPlants: (_params) =>
        Effect.succeed({
          items: [mockOverduePlant],
          hasMore: false,
          total: 1,
          page: 1,
          limit: 100,
        }),
    })

    const result = await Effect.runPromise(
      getOverduePlantsEffect().pipe(
        Effect.provide(Layer.merge(layer, JwtLayer))
      )
    )

    expect(result.text).toContain('Overdue Plants')
    expect(result.text).toContain('Thirsty Fern')
    expect(result.text).toContain('plant-overdue-1')
    expect(result.text).toContain('watering')
  })

  it('should return "no overdue" when empty', async () => {
    const layer = createMockApiClient()

    const result = await Effect.runPromise(
      getOverduePlantsEffect().pipe(
        Effect.provide(Layer.merge(layer, JwtLayer))
      )
    )

    expect(result.text).toContain('No overdue plants')
    expect(result.text).toContain('on schedule')
  })
})
