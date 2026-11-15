import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockPlants, noCare } from '@lily/api/__tests__/fixtures/plants'
import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockOutbox } from '@lily/api/__tests__/mocks/outbox'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { frequencyOfDays } from '@lily/api/contexts/care'
import { Dirty } from '@lily/api/contexts/reminders'
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
    const outbox = createMockOutbox()
    return {
      layer: Layer.mergeAll(
        createMockRoomRepository(roomsWithStranger),
        createMockPlantRepository({ plants }),
        care.layer,
        outbox.layer,
        MockSqlClientLive,
        Layer.succeed(GCSService, {} as any),
        Layer.succeed(FileSystem, {} as any)
      ),
      care,
      outbox,
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

  describe('image', () => {
    const edit = async (stored: string | null, imageUrl: string) => {
      const [first] = mockPlants
      if (!first) throw new Error('no plant fixture')
      const row = { ...first, imageUrl: stored }
      const { layer } = createTestLayer([row])
      const result = await Effect.runPromise(
        updatePlant(toPlantWithRoom(row), permit, {
          id: 'plant-1',
          name: 'Renamed',
          imageUrl,
        }).pipe(Effect.provide(layer))
      )
      return { name: result.name, imageUrl: result.imageUrl }
    }

    it.each([
      ['a URL on another host', 'https://tracker.example/pixel.jpg'],
      [
        "another account's public photo",
        'https://storage.googleapis.com/mock-bucket/users/user-2/avatars/face.png',
      ],
    ])('keeps the stored image for %s', async (_case, imageUrl) => {
      const stored =
        'https://storage.googleapis.com/mock-bucket/plants/plant-1/own.jpg'

      expect(await edit(stored, imageUrl)).toEqual({
        name: 'Renamed',
        imageUrl: stored,
      })
    })

    it('keeps the stored image when the edit screen sends it back', async () => {
      const stored = 'https://example.com/from-before.jpg'

      expect(await edit(stored, stored)).toEqual({
        name: 'Renamed',
        imageUrl: stored,
      })
    })

    it('stores the path of a file on the device as an older build sent it', async () => {
      const uri = 'file:///var/mobile/Containers/Data/tmp/photo.jpg'

      expect(await edit(null, uri)).toEqual({ name: 'Renamed', imageUrl: uri })
    })
  })

  describe('reminders', () => {
    it('stores the switch and asks Reminders to plan the plant again', async () => {
      const { layer, outbox } = createTestLayer()
      const result = await Effect.runPromise(
        updatePlant(toPlantWithRoom(mockPlants[0]!), permit, {
          id: 'plant-1',
          remindersEnabled: false,
        }).pipe(Effect.provide(layer))
      )

      expect(result.remindersEnabled).toBe(false)
      expect(outbox.requested).toEqual([
        Dirty.Plants({ plantIds: ['plant-1'] }),
      ])
    })

    it('asks Reminders nothing for an edit that leaves the switch alone', async () => {
      const { layer, outbox } = createTestLayer()
      await Effect.runPromise(
        updatePlant(toPlantWithRoom(mockPlants[0]!), permit, {
          id: 'plant-1',
          name: 'Updated Name',
        }).pipe(Effect.provide(layer))
      )

      expect(outbox.requested).toEqual([])
    })
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
