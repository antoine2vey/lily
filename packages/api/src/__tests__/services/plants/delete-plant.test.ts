import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { withUserOwner } from '@lily/api/repositories/helpers/plant-owner'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { deletePlant } from '@lily/api/services/plants/endpoints/delete-plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const asPlantWithRoom = (
  plant: ReturnType<typeof createTestPlant>
): PlantWithRoom => ({
  ...withUserOwner(plant),
  room: null,
  ownership: 'owned',
  ownerName: null,
  schedules: [],
})

describe('deletePlant', () => {
  it('returns the plant it deleted', async () => {
    const plant = createTestPlant({ id: 'plant-1', name: 'Monstera' })
    const result = await Effect.runPromise(
      deletePlant(asPlantWithRoom(plant)).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: [plant] }),
            createMockNotificationRepository([]),
            MockSqlClientLive
          )
        )
      )
    )

    expect(result).toMatchObject({
      id: 'plant-1',
      name: 'Monstera',
      room: null,
      ownership: 'owned',
      ownerName: null,
    })
  })

  it('fails with PlantNotFoundError when the row is already gone', async () => {
    const plant = createTestPlant({ id: 'plant-1' })
    const result = await Effect.runPromiseExit(
      deletePlant(asPlantWithRoom(plant)).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: [] }),
            createMockNotificationRepository([]),
            MockSqlClientLive
          )
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })
})
