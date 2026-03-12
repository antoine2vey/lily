import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { waterPlantEffect } from '@lily/mcp/tools/water-plant'
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

describe('waterPlant MCP tool', () => {
  const testLayer = Layer.mergeAll(
    createMockCurrentUser({ id: 'user-1' }),
    createMockPlantRepository({ plants: [mockPlant] }),
    createMockCareLogRepository([]),
    createMockEventBus(),
    createMockNotificationRepository([])
  )

  it('should return success message when plant is watered', async () => {
    const result = await Effect.runPromise(
      waterPlantEffect({ plantId: 'plant-1' }).pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('Watered')
    expect(result.text).toContain('Monstera')
    expect(result.text).toContain('successfully')
  })

  it('should return not found for invalid plant ID', async () => {
    const result = await Effect.runPromise(
      waterPlantEffect({ plantId: 'nonexistent' }).pipe(
        Effect.provide(testLayer)
      )
    )

    expect(result.text).toContain('not found')
  })

  it('should include notes when provided', async () => {
    const result = await Effect.runPromise(
      waterPlantEffect({
        plantId: 'plant-1',
        notes: 'Used filtered water',
      }).pipe(Effect.provide(testLayer))
    )

    expect(result.text).toContain('Watered')
    expect(result.text).toContain('Monstera')
  })
})
