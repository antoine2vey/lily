import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { CurrentJwt } from '@lily/mcp/api-client'
import { waterPlantEffect } from '@lily/mcp/tools/water-plant'
import type { Plant } from '@lily/shared/plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const JWT = 'test-jwt'
const JwtLayer = Layer.succeed(CurrentJwt, JWT)

const mockPlant: Plant = {
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
  health: 'HEALTHY',
  remindersEnabled: true,
  isFavorite: false,
  userId: 'user-1',
  roomId: null,
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
}

describe('waterPlant MCP tool', () => {
  const layer = Layer.merge(
    createMockApiClient({ waterPlant: () => Effect.succeed(mockPlant) }),
    JwtLayer
  )

  it('should return success message when plant is watered', async () => {
    const result = await Effect.runPromise(
      waterPlantEffect({ plantId: 'plant-1' }).pipe(Effect.provide(layer))
    )

    expect(result.text).toContain('Watered')
    expect(result.text).toContain('Monstera')
    expect(result.text).toContain('successfully')
  })

  it('should include next watering estimate from schedule', async () => {
    const result = await Effect.runPromise(
      waterPlantEffect({ plantId: 'plant-1' }).pipe(Effect.provide(layer))
    )

    expect(result.text).toContain('7 days')
    expect(result.feedback.nextCareEstimate).toBe('7 days')
  })
})
