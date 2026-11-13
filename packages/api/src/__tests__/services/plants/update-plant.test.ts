import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockPlants, noCare } from '@lily/api/__tests__/fixtures/plants'
import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { frequencyOfDays } from '@lily/api/contexts/care'
import { Actor, mintPermit } from '@lily/api/kernel/permit'
import { withUserOwner } from '@lily/api/repositories/helpers/plant-owner'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { RoomNotFoundError } from '@lily/shared'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Effect, Exit, Layer, Option } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { describe, expect, it } from 'vitest'

const toPlantWithRoom = (
  plant: (typeof mockPlants)[number]
): PlantWithRoom => ({
  ...withUserOwner(plant),
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  ...noCare,
})

const permit = mintPermit('plant-1', 'edit', Actor.User({ userId: 'user-1' }))

const strangersRoom = {
  ...mockRooms[0]!,
  id: 'room-stranger',
  userId: 'user-stranger',
}
const roomsWithStranger = [...mockRooms, strangersRoom]

describe('updatePlant', () => {
  const createTestLayer = (plants = mockPlants) => {
    const care = createStubCare()
    return {
      layer: Layer.mergeAll(
        createMockRoomRepository(roomsWithStranger),
        createMockPlantRepository({ plants }),
        care.layer,
        MockSqlClientLive,
        Layer.succeed(GCSService, {} as any),
        Layer.succeed(FileSystem, {} as any)
      ),
      care,
    }
  }

  it('should update plant fields', async () => {
    const { layer } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, permit, { id: 'plant-1', name: 'Updated Name' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.name).toBe('Updated Name')
  })

  it('should preserve other fields when updating', async () => {
    const { layer } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, permit, { id: 'plant-1', name: 'Updated Name' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.category).toBe(mockPlants[0]?.category)
    expect(result.id).toBe('plant-1')
  })

  it('should update multiple fields at once', async () => {
    const { layer, care } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, permit, {
        id: 'plant-1',
        name: 'Updated Name',
        description: 'Updated description',
        wateringFrequencyDays: 14,
        mistingFrequencyDays: null,
      }).pipe(Effect.provide(layer))
    )

    expect(result.name).toBe('Updated Name')
    expect(result.description).toBe('Updated description')
    expect(care.scheduled).toEqual([
      {
        permit,
        frequencies: [
          ['watering', Option.some(frequencyOfDays(14))],
          ['misting', Option.none()],
        ],
      },
    ])
  })

  it('should update health status', async () => {
    const { layer } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, permit, {
        id: 'plant-1',
        health: 'THRIVING',
      } as Parameters<typeof updatePlant>[2]).pipe(Effect.provide(layer))
    )

    expect(result.health).toBe('THRIVING')
  })

  describe('room', () => {
    const move = (roomId: string) =>
      Effect.runPromiseExit(
        updatePlant(toPlantWithRoom(mockPlants[0]!), permit, {
          id: 'plant-1',
          roomId,
        }).pipe(Effect.provide(createTestLayer().layer))
      )

    it("refuses to move the plant into a room its owner doesn't have", async () => {
      expect(failureOf(await move('room-stranger'))).toBeInstanceOf(
        RoomNotFoundError
      )
    })

    it("moves the plant into one of its owner's rooms", async () => {
      expect(Exit.isSuccess(await move('room-2'))).toBe(true)
    })
  })
})
