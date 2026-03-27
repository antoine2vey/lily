import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { CurrentJwt } from '@lily/mcp/api-client'
import { getPlantDetailsEffect } from '@lily/mcp/tools/get-plant-details'
import type { CareLog } from '@lily/shared/care-log'
import type { PlantDetail } from '@lily/shared/plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const JWT = 'test-jwt'
const JwtLayer = Layer.succeed(CurrentJwt, JWT)

const mockPlantDetail: PlantDetail = {
  id: 'plant-1',
  name: 'Monstera Deliciosa',
  description: 'A tropical plant',
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
      lastCareAt: new Date('2024-01-01'),
      nextCareAt: new Date('2024-01-08'),
    },
  ],
  photos: [],
}

const mockCareLogs: CareLog[] = [
  {
    id: 'log-1',
    type: 'watering',
    notes: 'Watered thoroughly',
    date: new Date('2024-01-05'),
    photoUrl: undefined,
    plantId: 'plant-1',
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-05'),
  },
]

const createLayer = () =>
  createMockApiClient({
    getPlant: (_plantId) => Effect.succeed(mockPlantDetail),
    getCareLogs: (_plantId, _params) =>
      Effect.succeed({
        items: mockCareLogs,
        hasMore: false,
        total: 1,
        page: 1,
        limit: 5,
      }),
  })

describe('getPlantDetails MCP tool', () => {
  it('should return detailed plant info with markdown formatting', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-1' }).pipe(
        Effect.provide(Layer.merge(createLayer(), JwtLayer))
      )
    )

    expect(result.text).toContain('## Monstera Deliciosa')
    expect(result.text).toContain('**Health**: Healthy')
    expect(result.text).toContain('**Category**: tropical')
    expect(result.text).toContain('**Added**: 2024-01-01')
  })

  it('should include care ratings and schedule', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-1' }).pipe(
        Effect.provide(Layer.merge(createLayer(), JwtLayer))
      )
    )

    expect(result.text).toContain('Water needs: 3/5')
    expect(result.text).toContain('Light needs: 3/5')
    expect(result.text).toContain('Humidity needs: 4/5')
    expect(result.text).toContain('Pet toxicity: 2/5')
    expect(result.text).toContain('Care Schedule')
    expect(result.text).toContain('watering')
  })

  it('should include recent care history', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-1' }).pipe(
        Effect.provide(Layer.merge(createLayer(), JwtLayer))
      )
    )

    expect(result.text).toContain('Recent Care History')
    expect(result.text).toContain('watering')
    expect(result.text).toContain('Watered thoroughly')
  })

  it('should return structured PlantDetail data', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-1' }).pipe(
        Effect.provide(Layer.merge(createLayer(), JwtLayer))
      )
    )

    expect(result.plant.id).toBe('plant-1')
    expect(result.plant.name).toBe('Monstera Deliciosa')
    expect(result.plant.healthLabel).toBe('Healthy')
    expect(result.plant.wateringRating).toBe(3)
  })
})
