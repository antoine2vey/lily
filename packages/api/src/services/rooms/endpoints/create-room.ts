import { EntityMutationDefect } from '@lily/api/errors/defects'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { RoomRepository } from '@lily/api/repositories/room.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { requireMembership } from '@lily/api/services/canopy/helpers/membership'
import { withOwnerLock } from '@lily/api/services/plants/helpers/owner-lock'
import type {
  CanopyNotFoundError,
  PlantOwner,
  Room,
  RoomCreateRequest,
} from '@lily/shared'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const createRoom = (
  request: RoomCreateRequest
): Effect.Effect<
  Room,
  SqlError | CanopyNotFoundError,
  RoomRepository | CurrentUser | CanopyRepository | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const repo = yield* RoomRepository
    const { id: userId } = yield* CurrentUser

    const owner: PlantOwner =
      request.owner === 'canopy'
        ? {
            _tag: 'Canopy',
            canopyId: (yield* requireMembership(userId)).canopyId,
          }
        : { _tag: 'User', userId }

    const room = yield* withOwnerLock(owner)(
      Effect.gen(function* () {
        const maxOrder = yield* repo.getMaxOrder(owner)
        return yield* repo.create({
          name: request.name,
          icon: request.icon,
          luminosity: request.luminosity,
          orientation: request.orientation,
          isOutdoor: request.isOutdoor,
          order: maxOrder + 1,
          owner,
        })
      })
    )

    if (!room) {
      return yield* Effect.die(
        new EntityMutationDefect({
          message: 'Room create returned null',
          entity: 'room',
          operation: 'create',
        })
      )
    }

    return room
  }).pipe(Effect.withSpan('RoomsService.createRoom'))
