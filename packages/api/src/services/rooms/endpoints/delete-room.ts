import { EntityMutationDefect } from '@lily/api/errors/defects'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware'
import { withRoomAuth } from '@lily/api/services/rooms/helpers/with-room-access'
import type { Room, RoomNotFoundError } from '@lily/shared'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const deleteRoom = (params: {
  id: string
}): Effect.Effect<
  Room,
  SqlError | RoomNotFoundError,
  RoomRepository | CanopyRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* RoomRepository
    const existing = yield* withRoomAuth(params.id)

    const room = yield* repo.delete(params.id, existing.owner)

    if (!room) {
      return yield* Effect.die(
        new EntityMutationDefect({
          message: 'Room delete returned null',
          entity: 'room',
          operation: 'delete',
        })
      )
    }

    return room
  }).pipe(
    Effect.withSpan('RoomsService.deleteRoom', {
      attributes: { 'room.id': params.id },
    })
  )
