import type { SqlError } from '@effect/sql/SqlError'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import type { RoomListWithCountsResponse } from '@lily/shared'
import { Effect } from 'effect'

export const findRooms = (): Effect.Effect<
  RoomListWithCountsResponse,
  SqlError,
  RoomRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* RoomRepository
    const { id: userId } = yield* CurrentUser
    return yield* repo.findAll(userId)
  }).pipe(Effect.withSpan('RoomsService.findRooms'))
