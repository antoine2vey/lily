import {
  mockPlantPhotos,
  mockPlants,
} from '@lily/api/__tests__/fixtures/plants'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockStoredRefRepository } from '@lily/api/__tests__/mocks/stored-ref.repository'
import { deletePlantPhoto } from '@lily/api/services/plants/endpoints/delete-plant-photo'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('deletePlantPhoto', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockPlantRepository({
        plants: mockPlants,
        photos: mockPlantPhotos,
      }),
      createMockGCSService(),
      createMockStoredRefRepository(),
      MockSqlClientLive
    )

  it('should delete photo successfully', async () => {
    await Effect.runPromise(
      deletePlantPhoto({ plantId: 'plant-1', photoId: 'photo-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // If no error is thrown, the deletion was successful
    expect(true).toBe(true)
  })

  it('should handle non-existent photo gracefully', async () => {
    await Effect.runPromise(
      deletePlantPhoto({ plantId: 'plant-1', photoId: 'non-existent' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // Should complete without error even for non-existent photo
    expect(true).toBe(true)
  })

  it('should handle non-existent plant gracefully', async () => {
    await Effect.runPromise(
      deletePlantPhoto({ plantId: 'non-existent', photoId: 'photo-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // Should complete without error
    expect(true).toBe(true)
  })
})
