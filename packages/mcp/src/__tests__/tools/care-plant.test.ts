import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { carePlantEffect } from '@lily/mcp/tools/care-plant'
import { Effect, Layer } from 'effect'
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

describe('carePlant MCP tool', () => {
  const testLayer = Layer.mergeAll(
    createMockCurrentUser({ id: 'user-1' }),
    createMockPlantRepository({ plants: [mockPlant] }),
    createMockCareLogRepository([]),
    createMockEventBus(),
    createMockNotificationRepository([])
  )

  it('should return success message for watering', async () => {
    const result = await Effect.runPromise(
      carePlantEffect({
        plantId: 'plant-1',
        type: 'watering',
      }).pipe(Effect.provide(testLayer))
    )

    expect(result).toContain('Watered')
    expect(result).toContain('Monstera')
    expect(result).toContain('successfully')
  })

  it('should return success message for fertilization', async () => {
    const result = await Effect.runPromise(
      carePlantEffect({
        plantId: 'plant-1',
        type: 'fertilization',
      }).pipe(Effect.provide(testLayer))
    )

    expect(result).toContain('Fertilized')
    expect(result).toContain('Monstera')
    expect(result).toContain('successfully')
  })

  it('should accept optional notes', async () => {
    const result = await Effect.runPromise(
      carePlantEffect({
        plantId: 'plant-1',
        type: 'watering',
        notes: 'Used filtered water',
      }).pipe(Effect.provide(testLayer))
    )

    expect(result).toContain('Watered')
    expect(result).toContain('Monstera')
  })

  it('should return not found for non-existent plant', async () => {
    const result = await Effect.runPromise(
      carePlantEffect({
        plantId: 'nonexistent',
        type: 'watering',
      }).pipe(Effect.provide(testLayer))
    )

    expect(result).toContain('not found')
  })

  it('should return not found for other users plant', async () => {
    const otherUsersPlant = {
      ...mockPlant,
      id: 'plant-other',
      userId: 'user-2',
    }

    const layer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: [otherUsersPlant] }),
      createMockCareLogRepository([]),
      createMockEventBus(),
      createMockNotificationRepository([])
    )

    const result = await Effect.runPromise(
      carePlantEffect({
        plantId: 'plant-other',
        type: 'fertilization',
      }).pipe(Effect.provide(layer))
    )

    expect(result).toContain('not found')
  })
})
