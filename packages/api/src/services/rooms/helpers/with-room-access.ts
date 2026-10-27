import {
  type CanopyMembership,
  CanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import {
  RoomRepository,
  type RoomRow,
} from '@lily/api/repositories/room.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { RoomNotFoundError } from '@lily/shared'
import { Effect, Match, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const canAccessRoom = (
  room: RoomRow,
  userId: string,
  membership: CanopyMembership | null
): boolean =>
  pipe(
    Match.value(room.owner),
    Match.tag('User', (owner) => owner.userId === userId),
    Match.tag('Canopy', (owner) =>
      Option.exists(
        Option.fromNullishOr(membership),
        (m) => m.canopyId === owner.canopyId
      )
    ),
    Match.exhaustive
  )

/**
 * Fetches a room by ID and returns it when the caller owns it or is a member
 * of its Canopy. Anything else reads as not found, so room ids can't be
 * probed.
 */
export const withRoomAuth = (
  roomId: string
): Effect.Effect<
  RoomRow,
  RoomNotFoundError | SqlError,
  RoomRepository | CanopyRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const room = yield* (yield* RoomRepository).findById(roomId)
    if (room === null) {
      return yield* new RoomNotFoundError({ roomId })
    }
    const { id: userId } = yield* CurrentUser
    const membership =
      room.owner._tag === 'Canopy'
        ? yield* (yield* CanopyRepository).findMembershipByUser(userId)
        : null
    if (!canAccessRoom(room, userId, membership)) {
      return yield* new RoomNotFoundError({ roomId })
    }
    return room
  }).pipe(Effect.withSpan('withRoomAuth'))
