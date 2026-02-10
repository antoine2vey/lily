import type { SqlError } from '@effect/sql/SqlError'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import {
  type Room,
  RoomNotFoundError,
  type RoomUpdateRequest,
} from '@lily/shared'
import { Effect } from 'effect'

export const updateRoom = (params: {
  id: string
  data: RoomUpdateRequest
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

    const room = yield* repo.update(params.id, params.data)

    if (!room) {
      return yield* Effect.die(new Error('Failed to update room'))
    }

    return room
  }).pipe(
    Effect.withSpan('RoomsService.updateRoom', {
      attributes: { 'room.id': params.id },
    })
  )
