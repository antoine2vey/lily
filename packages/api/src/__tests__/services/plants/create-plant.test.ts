import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import {
  createMockLimitChecker,
  MockLimitCheckerLive,
} from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import type { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { RoomNotFoundError } from '@lily/shared'
import { Array, Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const strangersRoom = {
  ...mockRooms[0]!,
  id: 'room-stranger',
  userId: 'user-stranger',
}
const roomsWithStranger = [...mockRooms, strangersRoom]

describe('createPlant', () => {
  const validRequest = {
    name: 'New Plant',
    description: 'A new plant description',
    category: 'tropical',
    wateringFrequencyDays: 7,
    luxNeeded: 2000,
    humidityRating: 3,
    petToxicityRating: 1,
  }

  const createTestLayer = (
    limits: Layer.Layer<LimitChecker> = MockLimitCheckerLive
  ) => {
    const rows = Array.map(mockPlants, (plant) => ({ ...plant }))
    const care = createInMemoryCare([], { plantRows: rows })
    return {
      layer: Layer.mergeAll(
        createMockRoomRepository(roomsWithStranger),
        createMockPlantRepository({ plants: rows, sharesPlantsArray: true }),
        createMockCurrentUser({ id: 'user-1' }),
        limits,
        createMockCanopyRepository(),
        createInMemoryCanopy().layer,
        care.layer
      ),
      care,
      rows,
    }
  }

  const frequenciesOf = (
    care: ReturnType<typeof createInMemoryCare>,
    plantId: string
  ) =>
    Array.flatMap(
      [...(care.plants.get(plantId)?.lines.values() ?? [])],
      (line) =>
        Option.toArray(
          Option.map(
            line.schedule,
            (schedule) => [line.careType, schedule.frequency] as const
          )
        )
    )

  it('should create a new plant', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.name).toBe('New Plant')
    expect(result.id).toBeDefined()
  })

  it('should return the created plant with an id', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.id).toBeTruthy()
    expect(typeof result.id).toBe('string')
  })

  it('should set default health to HEALTHY', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.health).toBe('HEALTHY')
  })

  it('should handle optional description', async () => {
    const requestWithoutDescription = {
      ...validRequest,
      description: undefined,
    }

    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(requestWithoutDescription).pipe(Effect.provide(layer))
    )

    expect(result.description).toBeNull()
  })

  it('schedules only watering when the request names no other frequency', async () => {
    const { layer, care } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(frequenciesOf(care, result.id)).toEqual([['watering', 7]])
  })

  it('schedules every care type whose frequency the request names', async () => {
    const { layer, care } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant({
        ...validRequest,
        fertilizationFrequencyDays: 14,
        mistingFrequencyDays: 3,
        repottingFrequencyDays: 180,
      }).pipe(Effect.provide(layer))
    )

    expect(frequenciesOf(care, result.id)).toEqual([
      ['watering', 7],
      ['fertilization', 14],
      ['misting', 3],
      ['repotting', 180],
    ])
  })

  it('should set imageUrl when provided', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant({
        ...validRequest,
        imageUrl: 'https://example.com/plant.jpg',
      }).pipe(Effect.provide(layer))
    )

    expect(result.imageUrl).toBe('https://example.com/plant.jpg')
  })

  it('should persist wateringRating when provided', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant({ ...validRequest, wateringRating: 80 }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.wateringRating).toBe(80)
  })

  it('should default wateringRating to 0 when omitted', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.wateringRating).toBe(0)
  })

  it('should default imageUrl to null when not provided', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result.imageUrl).toBeNull()
  })

  it('should convert luxNeeded to lightingRating', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant({ ...validRequest, luxNeeded: 5000 }).pipe(
        Effect.provide(layer)
      )
    )

    // 5000 lux → level 4 (direct light) → slider value 70
    expect(result.lightingRating).toBe(70)
  })

  it('should set lightingRating 1 for low lux', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant({ ...validRequest, luxNeeded: 200 }).pipe(
        Effect.provide(layer)
      )
    )

    // 200 lux → level 1 (low light) → slider value 10
    expect(result.lightingRating).toBe(10)
  })

  it('should honor explicit lightingRating over luxNeeded conversion', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      // luxNeeded alone would bucket to 70; explicit 75 must win
      createPlant({
        ...validRequest,
        luxNeeded: 5000,
        lightingRating: 75,
      }).pipe(Effect.provide(layer))
    )

    expect(result.lightingRating).toBe(75)
  })

  it('publishes that the caller planted it', async () => {
    const { layer, care } = createTestLayer()
    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(
      Array.filter(care.events, (event) => event._tag === 'PlantLifeChanged')
    ).toEqual([
      {
        _tag: 'PlantLifeChanged',
        plantId: result.id,
        owner: { _tag: 'User', userId: 'user-1' },
        life: 'Planted',
        by: 'user-1',
      },
    ])
  })

  it('should fail with LimitExceededError when plant limit is reached', async () => {
    const { layer, care, rows } = createTestLayer(
      createMockLimitChecker({ plantLimitReached: true })
    )

    const result = await Effect.runPromiseExit(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result._tag).toBe('Failure')
    expect(rows).toHaveLength(mockPlants.length)
    expect(care.events).toEqual([])
  })

  describe('room', () => {
    it("refuses another user's room", async () => {
      const exit = await Effect.runPromiseExit(
        createPlant({ ...validRequest, roomId: 'room-stranger' }).pipe(
          Effect.provide(createTestLayer().layer)
        )
      )

      expect(failureOf(exit)).toBeInstanceOf(RoomNotFoundError)
    })

    it('accepts one of your own rooms', async () => {
      const exit = await Effect.runPromiseExit(
        createPlant({ ...validRequest, roomId: 'room-1' }).pipe(
          Effect.provide(createTestLayer().layer)
        )
      )

      expect(Exit.isSuccess(exit)).toBe(true)
    })
  })
})
