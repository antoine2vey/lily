import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockRooms } from '@lily/api/__tests__/fixtures/rooms'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createRoom } from '@lily/api/services/rooms/endpoints/create-room'
import { CanopyNotFoundError } from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const canopyRoom = {
  ...mockRooms[0]!,
  id: 'room-canopy',
  userId: null,
  canopyId: mockCanopyId,
  order: 7,
}

const createTestLayer = (userId = 'user-1') =>
  Layer.mergeAll(
    createMockRoomRepository([...mockRooms, canopyRoom]),
    createMockCurrentUser({ id: userId }),
    createMockCanopyRepository(
      createCanopyStore({
        canopies: [createTestCanopyRow({ id: mockCanopyId })],
        members: [createTestMembership({ userId: 'user-1' })],
      })
    ),
    MockSqlClientLive
  )

describe('createRoom', () => {
  it('should create a room with name and default icon', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'Office', icon: '🏠', isOutdoor: false }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('Office')
    expect(result.userId).toBe('user-1')
  })

  it('should create a room with custom icon', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'Bathroom', icon: '🚿', isOutdoor: false }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('Bathroom')
    expect(result.icon).toBe('🚿')
  })

  it('should set order to maxOrder + 1', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'New Room', icon: '🏠', isOutdoor: false }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // user-1 has rooms with order 1 and 2, so new room should be 3
    expect(result.order).toBe(3)
  })

  it('should create a room with luminosity', async () => {
    const result = await Effect.runPromise(
      createRoom({
        name: 'Sunroom',
        icon: '☀️',
        luminosity: 4,
        isOutdoor: false,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.name).toBe('Sunroom')
    expect(result.luminosity).toBe(4)
  })

  it('should default luminosity to null when not provided', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'Office', icon: '🏠', isOutdoor: false }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.luminosity).toBeNull()
  })

  it('should set order to 1 when user has no rooms', async () => {
    const result = await Effect.runPromise(
      createRoom({ name: 'First Room', icon: '🏠', isOutdoor: false }).pipe(
        Effect.provide(createTestLayer('new-user'))
      )
    )

    expect(result.order).toBe(1)
  })

  it('should create an outdoor room', async () => {
    const result = await Effect.runPromise(
      createRoom({
        name: 'Garden',
        icon: '🌳',
        isOutdoor: true,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.name).toBe('Garden')
    expect(result.isOutdoor).toBe(true)
  })

  it('should create a room with all options set', async () => {
    const result = await Effect.runPromise(
      createRoom({
        name: 'Sunroom',
        icon: '☀️',
        luminosity: 5,
        isOutdoor: true,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.name).toBe('Sunroom')
    expect(result.luminosity).toBe(5)
    expect(result.isOutdoor).toBe(true)
  })

  it("creates a Canopy room for a member, ordered after the Canopy's rooms", async () => {
    const result = await Effect.runPromise(
      createRoom({
        name: 'Shared kitchen',
        icon: '🍳',
        isOutdoor: false,
        owner: 'canopy',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toMatchObject({
      userId: null,
      canopyId: mockCanopyId,
      order: 8,
    })
  })

  it('refuses a Canopy room to a user in no Canopy', async () => {
    const exit = await Effect.runPromiseExit(
      createRoom({
        name: 'Shared kitchen',
        icon: '🍳',
        isOutdoor: false,
        owner: 'canopy',
      }).pipe(Effect.provide(createTestLayer('user-2')))
    )

    expect(Exit.isFailure(exit) && failureOf(exit)).toEqual(
      new CanopyNotFoundError()
    )
  })
})
