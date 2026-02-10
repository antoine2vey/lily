import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createRoom } from '@lily/api/services/rooms/endpoints/create-room'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const createTestLayer = (userId = 'user-1') =>
  Layer.mergeAll(
    createMockRoomRepository(mockRooms),
    createMockCurrentUser({ id: userId })
  )

describe('createRoom', () => {
  it('should create a room with name and default icon', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'Office', icon: '🏠' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('Office')
    expect(result.userId).toBe('user-1')
  })

  it('should create a room with custom icon', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'Bathroom', icon: '🚿' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('Bathroom')
    expect(result.icon).toBe('🚿')
  })

  it('should set order to maxOrder + 1', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'New Room', icon: '🏠' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // user-1 has rooms with order 1 and 2, so new room should be 3
    expect(result.order).toBe(3)
  })

  it('should create a room with luminosity', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'Sunroom', icon: '☀️', luminosity: 4 }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('Sunroom')
    expect(result.luminosity).toBe(4)
  })

  it('should default luminosity to null when not provided', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'Office', icon: '🏠' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.luminosity).toBeNull()
  })

  it('should set order to 1 when user has no rooms', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'First Room', icon: '🏠' }).pipe(
        Effect.provide(createTestLayer('new-user'))
      )
    )

    expect(result.order).toBe(1)
  })
})
