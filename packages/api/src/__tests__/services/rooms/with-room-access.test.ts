import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createTestRoom } from '@lily/api/__tests__/fixtures/rooms'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { withRoomAuth } from '@lily/api/services/rooms/helpers/with-room-access'
import { type CanopyId, RoomNotFoundError } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const alex = 'user-alex'
const lily = 'user-lily'
const sam = 'user-sam'

const alexRoom = createTestRoom({ id: 'alex-room', userId: alex })
const canopyRoom = createTestRoom({
  id: 'canopy-room',
  userId: null,
  canopyId: mockCanopyId,
})

const members = [
  createTestMembership({ userId: alex, role: 'owner' }),
  createTestMembership({ userId: lily }),
  createTestMembership({ userId: sam, canopyId: 'canopy-2' as CanopyId }),
]

const run = (userId: string, roomId: string) =>
  Effect.runPromiseExit(
    withRoomAuth(roomId).pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockRoomRepository([alexRoom, canopyRoom]),
          createMockCanopyRepository(members),
          createMockCurrentUser({ id: userId })
        )
      )
    )
  )

describe('withRoomAuth', () => {
  it('returns a personal room to its owner', async () => {
    const exit = await run(alex, 'alex-room')
    expect(exit._tag).toBe('Success')
  })

  it('returns a Canopy room to a member', async () => {
    const exit = await run(lily, 'canopy-room')
    expect(exit._tag).toBe('Success')
  })

  it("answers someone else's personal room like a missing one", async () => {
    const [others, missing] = await Promise.all([
      run(lily, 'alex-room'),
      run(lily, 'missing'),
    ])
    expect(failureOf(others)).toEqual(
      new RoomNotFoundError({ roomId: 'alex-room' })
    )
    expect(failureOf(missing)).toEqual(
      new RoomNotFoundError({ roomId: 'missing' })
    )
  })

  it('answers a member of another Canopy like a missing room', async () => {
    const exit = await run(sam, 'canopy-room')
    expect(failureOf(exit)).toEqual(
      new RoomNotFoundError({ roomId: 'canopy-room' })
    )
  })

  it('answers a user with no Canopy like a missing room', async () => {
    const exit = await run('user-stranger', 'canopy-room')
    expect(failureOf(exit)).toEqual(
      new RoomNotFoundError({ roomId: 'canopy-room' })
    )
  })
})
