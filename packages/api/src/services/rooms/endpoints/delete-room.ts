import type { SqlError } from '@effect/sql/SqlError'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { type Room, RoomNotFoundError } from '@lily/shared'
import { Effect } from 'effect'

export const deleteRoom = (params: {
  id: string
}): Effect.Effect<
  Room,
  SqlError | RoomNotFoundError,
  RoomRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* RoomRepository
    const { id: userId } = yield* CurrentUser

    const existing = yield* repo.findById(params.id)
    if (!existing || existing.userId !== userId) {
      return yield* Effect.fail(new RoomNotFoundError({ roomId: params.id }))
    }

    const room = yield* repo.delete(params.id)

    if (!room) {
      return yield* Effect.die(new Error('Failed to delete room'))
    }

    return room
  }).pipe(
    Effect.withSpan('RoomsService.deleteRoom', {
      attributes: { 'room.id': params.id },
    })
  )
