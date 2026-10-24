import { RoomRepository } from '@lily/api/repositories/room.repository'
import { RoomNotFoundError } from '@lily/shared'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * A plant may only sit in a room of its owner. Someone else's room reads as
 * not found, so room ids can't be probed.
 */
export const assertRoomBelongsTo = (
  roomId: string | null | undefined,
  ownerId: string
): Effect.Effect<void, RoomNotFoundError | SqlError, RoomRepository> =>
  Effect.gen(function* () {
    if (roomId == null) {
      return
    }
    const roomRepo = yield* RoomRepository
    const room = yield* roomRepo.findById(roomId)
    if (room === null || room.userId !== ownerId) {
      return yield* new RoomNotFoundError({ roomId })
    }
  }).pipe(Effect.withSpan('assertRoomBelongsTo'))
