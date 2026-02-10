import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { findRooms } from '@lily/api/services/rooms/endpoints/find-rooms'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const createTestLayer = (userId = 'user-1') =>
  Layer.mergeAll(
    createMockRoomRepository(mockRooms),
    createMockCurrentUser({ id: userId })
  )

describe('findRooms', () => {
  it('should return rooms for the current user', async () => {
    const result = await Effect.runPromise(
      findRooms().pipe(Effect.provide(createTestLayer()))
    )

    expect(result.length).toBe(2)
    expect(Array.every(result, (r) => r.userId === 'user-1')).toBe(true)
  })

  it('should return rooms ordered by order then name', async () => {
    const result = await Effect.runPromise(
      findRooms().pipe(Effect.provide(createTestLayer()))
    )

    expect(result[0]?.name).toBe('Living Room')
    expect(result[1]?.name).toBe('Kitchen')
  })

  it('should include plant count', async () => {
    const result = await Effect.runPromise(
      findRooms().pipe(Effect.provide(createTestLayer()))
    )

    expect(result[0]).toHaveProperty('plantCount')
    expect(typeof result[0]?.plantCount).toBe('number')
  })

  it('should return empty array when user has no rooms', async () => {
    const result = await Effect.runPromise(
      findRooms().pipe(Effect.provide(createTestLayer('non-existent-user')))
    )

    expect(result).toEqual([])
  })

  it('should isolate rooms by user', async () => {
    const result = await Effect.runPromise(
      findRooms().pipe(Effect.provide(createTestLayer('user-2')))
    )

    expect(result.length).toBe(1)
    expect(result[0]?.name).toBe('Bedroom')
  })
})
