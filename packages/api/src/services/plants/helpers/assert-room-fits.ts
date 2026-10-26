import { sameOwner } from '@lily/api/repositories/helpers/plant-owner'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import { type PlantOwner, RoomNotFoundError } from '@lily/shared'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * A plant sits only in a room of its own owner: a personal plant in one of
 * its user's rooms, a Canopy plant in one of its Canopy's rooms. Any other
 * room reads as not found, so room ids can't be probed.
 */
export const assertRoomFits = (
  roomId: string | null | undefined,
  owner: PlantOwner
): Effect.Effect<void, RoomNotFoundError | SqlError, RoomRepository> =>
  Effect.gen(function* () {
    if (roomId == null) {
      return
    }
    const roomRepo = yield* RoomRepository
    const room = yield* roomRepo.findById(roomId)
    if (room === null || !sameOwner(room.owner, owner)) {
      return yield* new RoomNotFoundError({ roomId })
    }
  }).pipe(Effect.withSpan('assertRoomFits'))
