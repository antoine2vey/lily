import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createTestRoom } from '@lily/api/__tests__/fixtures/rooms'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import { type CanopyId, type PlantOwner, RoomNotFoundError } from '@lily/shared'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const alex: PlantOwner = { _tag: 'User', userId: 'user-alex' }
const canopy: PlantOwner = {
  _tag: 'Canopy',
  canopyId: mockCanopyId as CanopyId,
}

const rooms = [
  createTestRoom({ id: 'alex-room', userId: 'user-alex' }),
  createTestRoom({ id: 'canopy-room', userId: null, canopyId: mockCanopyId }),
]

const run = (roomId: string | null | undefined, owner: PlantOwner) =>
  Effect.runPromiseExit(
    assertRoomFits(roomId, owner).pipe(
      Effect.provide(createMockRoomRepository(rooms))
    )
  )

describe('assertRoomFits', () => {
  it('accepts a personal room for its owner and a Canopy room for its Canopy', async () => {
    expect((await run('alex-room', alex))._tag).toBe('Success')
    expect((await run('canopy-room', canopy))._tag).toBe('Success')
  })

  it('accepts no room at all', async () => {
    expect((await run(null, alex))._tag).toBe('Success')
    expect((await run(undefined, canopy))._tag).toBe('Success')
  })

  it('refuses a personal room for a Canopy plant, as not found', async () => {
    expect(failureOf(await run('alex-room', canopy))).toEqual(
      new RoomNotFoundError({ roomId: 'alex-room' })
    )
  })

  it('refuses a Canopy room for a personal plant, as not found', async () => {
    expect(failureOf(await run('canopy-room', alex))).toEqual(
      new RoomNotFoundError({ roomId: 'canopy-room' })
    )
  })

  it("refuses another user's room with the same answer as a missing one", async () => {
    const lily: PlantOwner = { _tag: 'User', userId: 'user-lily' }
    expect(failureOf(await run('alex-room', lily))).toEqual(
      new RoomNotFoundError({ roomId: 'alex-room' })
    )
    expect(failureOf(await run('missing', lily))).toEqual(
      new RoomNotFoundError({ roomId: 'missing' })
    )
  })
})
