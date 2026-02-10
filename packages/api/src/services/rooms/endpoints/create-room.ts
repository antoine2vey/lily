import type { SqlError } from '@effect/sql/SqlError'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import type { Room, RoomCreateRequest } from '@lily/shared'
import { Effect } from 'effect'

export const createRoom = (
  request: RoomCreateRequest
): Effect.Effect<Room, SqlError, RoomRepository | CurrentUser> =>
  Effect.gen(function* () {
    const repo = yield* RoomRepository
    const { id: userId } = yield* CurrentUser

    const maxOrder = yield* repo.getMaxOrder(userId)

    const room = yield* repo.create({
      name: request.name,
      icon: request.icon,
      luminosity: request.luminosity,
      order: maxOrder + 1,
      userId,
    })

    if (!room) {
      return yield* Effect.die(new Error('Failed to create room'))
    }

    return room
  }).pipe(Effect.withSpan('RoomsService.createRoom'))
