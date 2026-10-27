import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { withUserOwner } from '@lily/api/repositories/helpers/plant-owner'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { RoomNotFoundError } from '@lily/shared'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Array, Effect, Exit, Layer, Option, pipe } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { describe, expect, it } from 'vitest'

const toPlantWithRoom = (
  plant: (typeof mockPlants)[number]
): PlantWithRoom => ({
  ...withUserOwner(plant),
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: [],
})

const findSchedule = (
  schedules: CareScheduleRow[],
  plantId: string,
  careType: string
) =>
  pipe(
    Array.findFirst(
      schedules,
      (s) => s.plantId === plantId && s.careType === careType
    ),
    Option.getOrNull
  )

const strangersRoom = {
  ...mockRooms[0]!,
  id: 'room-stranger',
  userId: 'user-stranger',
}
const roomsWithStranger = [...mockRooms, strangersRoom]

describe('updatePlant', () => {
  const createTestLayer = (plants = mockPlants) => {
    const schedules = schedulesFromPlants(plants)
    return {
      layer: Layer.mergeAll(
        createMockRoomRepository(roomsWithStranger),
        createMockPlantRepository({ plants }),
        createMockCareScheduleRepository({ schedules, plants }),
        Layer.succeed(GCSService, {} as any),
        Layer.succeed(FileSystem, {} as any)
      ),
      schedules,
    }
  }

  it('should update plant fields', async () => {
    const { layer } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, { id: 'plant-1', name: 'Updated Name' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.name).toBe('Updated Name')
  })

  it('should preserve other fields when updating', async () => {
    const { layer } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, { id: 'plant-1', name: 'Updated Name' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.category).toBe(mockPlants[0]?.category)
    expect(result.id).toBe('plant-1')
  })

  it('should update multiple fields at once', async () => {
    const { layer, schedules } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, {
        id: 'plant-1',
        name: 'Updated Name',
        description: 'Updated description',
        wateringFrequencyDays: 14,
      }).pipe(Effect.provide(layer))
    )

    expect(result.name).toBe('Updated Name')
    expect(result.description).toBe('Updated description')
    const wateringSchedule = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSchedule?.frequencyDays).toBe(14)
  })

  it('should update health status', async () => {
    const { layer } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, { id: 'plant-1', health: 'THRIVING' } as Parameters<
        typeof updatePlant
      >[1]).pipe(Effect.provide(layer))
    )

    expect(result.health).toBe('THRIVING')
  })

  describe('room', () => {
    const move = (roomId: string) =>
      Effect.runPromiseExit(
        updatePlant(toPlantWithRoom(mockPlants[0]!), {
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
