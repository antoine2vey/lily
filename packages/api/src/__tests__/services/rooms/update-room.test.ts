import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { updateRoom } from '@lily/api/services/rooms/endpoints/update-room'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const createTestLayer = (userId = 'user-1') =>
  Layer.mergeAll(
    createMockRoomRepository(mockRooms),
    createMockCurrentUser({ id: userId })
  )

describe('updateRoom', () => {
  it('should update room name', async () => {
    const result = await Effect.runPromise(
      updateRoom({ id: 'room-1', data: { name: 'Salon' } }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('Salon')
    expect(result.id).toBe('room-1')
  })

  it('should update room icon', async () => {
    const result = await Effect.runPromise(
      updateRoom({ id: 'room-1', data: { icon: '🌿' } }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.icon).toBe('🌿')
  })

  it('should update room order', async () => {
    const result = await Effect.runPromise(
      updateRoom({ id: 'room-1', data: { order: 5 } }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.order).toBe(5)
  })

  it('should fail with RoomNotFoundError when room does not exist', async () => {
    const result = await Effect.runPromiseExit(
      updateRoom({ id: 'non-existent', data: { name: 'test' } }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when user tries to update another users room', async () => {
    // room-3 belongs to user-2
    const result = await Effect.runPromiseExit(
      updateRoom({ id: 'room-3', data: { name: 'test' } }).pipe(
        Effect.provide(createTestLayer('user-1'))
      )
    )

    expect(result._tag).toBe('Failure')
  })
})
