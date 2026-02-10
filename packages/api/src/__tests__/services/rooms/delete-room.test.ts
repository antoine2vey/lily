import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { deleteRoom } from '@lily/api/services/rooms/endpoints/delete-room'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const createTestLayer = (userId = 'user-1') =>
  Layer.mergeAll(
    createMockRoomRepository(mockRooms),
    createMockCurrentUser({ id: userId })
  )

describe('deleteRoom', () => {
  it('should delete existing room', async () => {
    const result = await Effect.runPromise(
      deleteRoom({ id: 'room-1' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.id).toBe('room-1')
    expect(result.name).toBe('Living Room')
  })

  it('should return the deleted room', async () => {
    const result = await Effect.runPromise(
      deleteRoom({ id: 'room-2' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.id).toBe('room-2')
    expect(result.name).toBe('Kitchen')
  })

  it('should fail with RoomNotFoundError when room does not exist', async () => {
    const result = await Effect.runPromiseExit(
      deleteRoom({ id: 'non-existent' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when user tries to delete another users room', async () => {
    // room-3 belongs to user-2
    const result = await Effect.runPromiseExit(
      deleteRoom({ id: 'room-3' }).pipe(
        Effect.provide(createTestLayer('user-1'))
      )
    )

    expect(result._tag).toBe('Failure')
  })
})
