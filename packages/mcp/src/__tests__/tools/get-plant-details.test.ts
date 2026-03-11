import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { getPlantDetailsEffect } from '@lily/mcp/tools/get-plant-details'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const mockPlant = {
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
  health: 'HEALTHY' as const,
  userId: 'user-1',
  roomId: null,
  remindersEnabled: true,
  isFavorite: false,
}

const mockPlantNeedsAttention = {
  ...mockPlant,
  id: 'plant-2',
  name: 'Sick Fern',
  health: 'NEEDS_ATTENTION' as const,
  category: null,
}

describe('getPlantDetails MCP tool', () => {
  const testLayer = Layer.mergeAll(
    createMockCurrentUser({ id: 'user-1' }),
    createMockPlantRepository({ plants: [mockPlant, mockPlantNeedsAttention] }),
    createMockCareLogRepository(mockCareLogs)
  )

  it('should return detailed plant info with markdown formatting', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-1' }).pipe(
        Effect.provide(testLayer)
      )
    )

    expect(result).toContain('## Monstera Deliciosa')
    expect(result).toContain('**Health**: Healthy')
    expect(result).toContain('**Category**: tropical')
    expect(result).toContain('**Added**: 2024-01-01')
  })

  it('should include care ratings', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-1' }).pipe(
        Effect.provide(testLayer)
      )
    )

    expect(result).toContain('Water needs: 3/5')
    expect(result).toContain('Light needs: 3/5')
    expect(result).toContain('Humidity needs: 4/5')
    expect(result).toContain('Pet toxicity: 2/5')
  })

  it('should include recent care history', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-1' }).pipe(
        Effect.provide(testLayer)
      )
    )

    expect(result).toContain('Recent Care History')
    expect(result).toContain('watering')
    expect(result).toContain('Watered thoroughly')
  })

  it('should show "No room assigned" when plant has no room', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-1' }).pipe(
        Effect.provide(testLayer)
      )
    )

    expect(result).toContain('No room assigned')
  })

  it('should show room info when plant has a room', async () => {
    const plantWithRoom = {
      ...mockPlant,
      id: 'plant-room',
      roomId: 'room-1',
    }

    const layer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({
        plants: [plantWithRoom],
        rooms: [
          {
            id: 'room-1',
            name: 'Living Room',
            icon: '🛋️',
            luminosity: null,
            isOutdoor: false,
          },
        ],
      }),
      createMockCareLogRepository([])
    )

    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-room' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result).toContain('🛋️ Living Room')
  })

  it('should handle all health statuses', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-2' }).pipe(
        Effect.provide(testLayer)
      )
    )

    expect(result).toContain('Needs Attention')
  })

  it('should show "Unknown" for null category', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-2' }).pipe(
        Effect.provide(testLayer)
      )
    )

    expect(result).toContain('**Category**: Unknown')
  })

  it('should return not found for non-existent plant', async () => {
    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'nonexistent' }).pipe(
        Effect.provide(testLayer)
      )
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
      createMockCareLogRepository([])
    )

    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-other' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result).toContain('not found')
  })

  it('should show care history without notes gracefully', async () => {
    const logsWithoutNotes = [
      {
        id: 'log-no-notes',
        type: 'watering' as const,
        notes: undefined,
        date: new Date('2024-01-05'),
        photoUrl: undefined,
        plantId: 'plant-1',
        createdAt: new Date('2024-01-05'),
        updatedAt: new Date('2024-01-05'),
      },
    ]

    const layer = Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: [mockPlant] }),
      createMockCareLogRepository(logsWithoutNotes)
    )

    const result = await Effect.runPromise(
      getPlantDetailsEffect({ plantId: 'plant-1' }).pipe(Effect.provide(layer))
    )

    expect(result).toContain('2024-01-05: watering')
    // No trailing " — " when no notes
    expect(result).not.toContain('— ')
  })
})
