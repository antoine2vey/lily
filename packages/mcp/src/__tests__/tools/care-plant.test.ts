import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { CurrentJwt } from '@lily/mcp/api-client'
import { carePlantEffect } from '@lily/mcp/tools/care-plant'
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
    {
      careType: 'fertilization',
      frequencyDays: 30,
      lastCareAt: null,
      nextCareAt: null,
    },
    {
      careType: 'misting',
      frequencyDays: 2,
      lastCareAt: new Date('2024-01-01'),
      nextCareAt: new Date('2024-01-03'),
    },
    {
      careType: 'repotting',
      frequencyDays: 365,
      lastCareAt: null,
      nextCareAt: null,
    },
  ],
}

describe('carePlant MCP tool', () => {
  const layer = Layer.merge(
    createMockApiClient({ carePlant: () => Effect.succeed(mockPlant) }),
    JwtLayer
  )

  it('should return "Watered" label for watering', async () => {
    const result = await Effect.runPromise(
      carePlantEffect({ plantId: 'plant-1', type: 'watering' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.text).toContain('Watered')
    expect(result.text).toContain('Monstera')
    expect(result.text).toContain('successfully')
    expect(result.feedback.nextCareEstimate).toBe('7 days')
  })

  it('should return "Fertilized" label for fertilization', async () => {
    const result = await Effect.runPromise(
      carePlantEffect({ plantId: 'plant-1', type: 'fertilization' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.text).toContain('Fertilized')
    expect(result.text).toContain('Monstera')
    expect(result.feedback.nextCareEstimate).toBe('30 days')
  })

  it('should return "Misted" label for misting', async () => {
    const result = await Effect.runPromise(
      carePlantEffect({ plantId: 'plant-1', type: 'misting' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.text).toContain('Misted')
    expect(result.text).toContain('Monstera')
    expect(result.feedback.nextCareEstimate).toBe('2 days')
  })

  it('should return "Repotted" label for repotting', async () => {
    const result = await Effect.runPromise(
      carePlantEffect({ plantId: 'plant-1', type: 'repotting' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.text).toContain('Repotted')
    expect(result.text).toContain('Monstera')
    expect(result.feedback.nextCareEstimate).toBe('365 days')
  })
})
