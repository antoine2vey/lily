import { RoomRepository } from '@lily/api/repositories/room.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import type { RoomListWithCountsResponse } from '@lily/shared'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const findRooms = (options: {
  readonly includeCanopy: boolean
}): Effect.Effect<
  RoomListWithCountsResponse,
  SqlError,
  RoomRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* RoomRepository
    const { id: userId } = yield* CurrentUser
    return yield* repo.findAll({
      userId,
      includeCanopy: options.includeCanopy,
    })
  }).pipe(Effect.withSpan('RoomsService.findRooms'))
