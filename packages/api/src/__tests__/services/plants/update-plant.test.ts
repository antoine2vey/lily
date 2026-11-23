import { mockPlants, noCare } from '@lily/api/__tests__/fixtures/plants'
import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import {
  createInMemoryGCS,
  createMockGCSService,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockOutbox } from '@lily/api/__tests__/mocks/outbox'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import {
  createMockSqlClient,
  MockSqlClientLive,
} from '@lily/api/__tests__/mocks/sql-client'
import { createMockStoredRefRepository } from '@lily/api/__tests__/mocks/stored-ref.repository'
import { frequencyOfDays } from '@lily/api/contexts/care'
import { Dirty } from '@lily/api/contexts/reminders'
import { Actor, mintPermit } from '@lily/api/kernel/permit'
import { withUserOwner } from '@lily/api/repositories/helpers/plant-owner'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { RoomNotFoundError } from '@lily/shared'
import { failureOf } from '@lily/shared/testing'
import { Effect, Exit, Layer, Option } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
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

const image = {
  _tag: 'PersistedFile',
  key: 'image',
  name: 'photo.png',
  contentType: 'image/png',
  path: '/tmp/photo.png',
} as unknown as PersistedFile

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
        createMockGCSService(),
        createMockStoredRefRepository(),
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

  it('deletes the uploaded image when the plant is gone before the write', async () => {
    const gcs = createInMemoryGCS()
    const layer = Layer.mergeAll(
      createMockRoomRepository(roomsWithStranger),
      createMockPlantRepository({ plants: [] }),
      createStubCare().layer,
      createMockOutbox().layer,
      MockSqlClientLive,
      gcs.layer,
      createMockStoredRefRepository(),
      createMockFileSystem()
    )
    const plant = toPlantWithRoom(mockPlants[0]!)

    const outcome = await Effect.runPromise(
      updatePlant(plant, permit, { id: 'plant-1' }, image).pipe(
        Effect.as('updated'),
        Effect.catchTag('PlantNotFoundError', () => Effect.succeed('gone')),
        Effect.provide(layer)
      )
    )

    expect({ outcome, stored: [...gcs.objects.plant] }).toEqual({
      outcome: 'gone',
      stored: [],
    })
  })

  it('keeps the uploaded image when the commit is not acknowledged', async () => {
    const gcs = createInMemoryGCS()
    const layer = Layer.mergeAll(
      createMockRoomRepository(roomsWithStranger),
      createMockPlantRepository({ plants: mockPlants }),
      createStubCare().layer,
      createMockOutbox().layer,
      createMockSqlClient({ commitUnanswered: true }),
      gcs.layer,
      createMockStoredRefRepository(),
      createMockFileSystem()
    )
    const plant = toPlantWithRoom(mockPlants[0]!)

    const written = await Effect.runPromise(
      updatePlant(plant, permit, { id: 'plant-1' }, image).pipe(
        Effect.catchTag('SqlError', () => Effect.void),
        Effect.andThen(
          Effect.flatMap(PlantRepository, (repo) => repo.findById('plant-1'))
        ),
        Effect.provide(layer)
      )
    )

    expect([...gcs.objects.plant].map(mockPublicUrl)).toEqual([
      written?.imageUrl,
    ])
  })
})
