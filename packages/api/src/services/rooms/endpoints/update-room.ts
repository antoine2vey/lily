import { EntityMutationDefect } from '@lily/api/errors/defects'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware'
import { withRoomAuth } from '@lily/api/services/rooms/helpers/with-room-access'
import type { Room, RoomNotFoundError, RoomUpdateRequest } from '@lily/shared'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const updateRoom = (params: {
  id: string
  data: RoomUpdateRequest
}): Effect.Effect<
  Room,
  SqlError | RoomNotFoundError,
  RoomRepository | CanopyRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* RoomRepository
    const existing = yield* withRoomAuth(params.id)

    const room = yield* repo.update(params.id, existing.owner, params.data)

    if (!room) {
      return yield* Effect.die(
        new EntityMutationDefect({
          message: 'Room update returned null',
          entity: 'room',
          operation: 'update',
        })
      )
    }

    return room
  }).pipe(
    Effect.withSpan('RoomsService.updateRoom', {
      attributes: { 'room.id': params.id },
    })
  )
