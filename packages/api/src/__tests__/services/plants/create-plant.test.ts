import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import {
  createMockLimitChecker,
  MockLimitCheckerLive,
} from '@lily/api/__tests__/mocks/limit-checker'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { frequencyOfDays } from '@lily/api/contexts/care'
import type { AppEvent } from '@lily/api/events'
import { systemPermit } from '@lily/api/kernel/permit'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { RoomNotFoundError } from '@lily/shared'
import { Effect, Exit, Layer, Option } from 'effect'
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

  const createTestLayer = () => {
    const care = createStubCare()
    return {
      layer: Layer.mergeAll(
        createMockRoomRepository(roomsWithStranger),
        createMockPlantRepository({ plants: mockPlants }),
        createMockEventBus(),
        createMockCurrentUser({ id: 'user-1' }),
        MockLimitCheckerLive,
        MockSqlClientLive,
        MockOutboxLive,
        createMockCanopyRepository(),
        createInMemoryCanopy().layer,
        care.layer
      ),
      care,
    }
  }

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

    expect(care.scheduled).toEqual([
      {
        permit: systemPermit(result.id, 'edit', 'create-plant'),
        frequencies: [['watering', Option.some(frequencyOfDays(7))]],
      },
    ])
  })

  it('schedules every care type whose frequency the request names', async () => {
    const { layer, care } = createTestLayer()
    await Effect.runPromise(
      createPlant({
        ...validRequest,
        fertilizationFrequencyDays: 14,
        mistingFrequencyDays: 3,
        repottingFrequencyDays: 180,
      }).pipe(Effect.provide(layer))
    )

    expect(care.scheduled[0]?.frequencies).toEqual([
      ['watering', Option.some(frequencyOfDays(7))],
      ['fertilization', Option.some(frequencyOfDays(14))],
      ['misting', Option.some(frequencyOfDays(3))],
      ['repotting', Option.some(frequencyOfDays(180))],
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

  it('should publish PlantCreated event', async () => {
    const publishedEvents: AppEvent[] = []
    const eventBusMock = createMockEventBus({ publishedEvents })

    const result = await Effect.runPromise(
      createPlant(validRequest).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockRoomRepository(roomsWithStranger),
            createMockPlantRepository({ plants: mockPlants }),
            eventBusMock,
            createMockCurrentUser({ id: 'user-1' }),
            MockLimitCheckerLive,
            MockSqlClientLive,
            MockOutboxLive,
            createMockCanopyRepository(),
            createInMemoryCanopy().layer,
            createStubCare().layer
          )
        )
      )
    )

    expect(publishedEvents.length).toBe(1)
    expect(publishedEvents[0]).toMatchObject({
      _tag: 'PlantCreated',
      userId: 'user-1',
      plantId: result.id,
    })
  })

  it('should fail with LimitExceededError when plant limit is reached', async () => {
    const layer = Layer.mergeAll(
      createMockRoomRepository(roomsWithStranger),
      createMockPlantRepository({ plants: mockPlants }),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' }),
      createMockLimitChecker({ plantLimitReached: true }),
      MockSqlClientLive,
      MockOutboxLive,
      createMockCanopyRepository(),
      createInMemoryCanopy().layer,
      createStubCare().layer
    )

    const result = await Effect.runPromiseExit(
      createPlant(validRequest).pipe(Effect.provide(layer))
    )

    expect(result._tag).toBe('Failure')
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
