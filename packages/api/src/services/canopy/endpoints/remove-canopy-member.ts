import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import {
  dropMember,
  requireOwner,
} from '@lily/api/services/canopy/helpers/membership'
import {
  dispatchNow,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { changeMyCanopy } from '@lily/api/services/plants/helpers/plant-change'
import { CanopyMemberNotFoundError } from '@lily/shared'
import { Array, Effect, Option } from 'effect'

export const removeCanopyMember = Effect.fn('CanopyService.removeCanopyMember')(
  function* (memberUserId: string) {
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository

    const { canopy, notification } = yield* changeMyCanopy(userId)(
      ({ canopy, membership }) =>
        Effect.gen(function* () {
          yield* requireOwner(membership)
          const members = yield* repo.findMembersByJoinDate(canopy.id)
          const removed = yield* Option.match(
            Array.findFirst(
              members,
              (m) => m.userId === memberUserId && m.userId !== userId
            ),
            {
              onNone: () => Effect.fail(new CanopyMemberNotFoundError()),
              onSome: Effect.succeed,
            }
          )
          yield* dropMember(canopy.id, removed.userId, 'return')
          yield* repo.revokeInvite(canopy.id)
          const notification = yield* recordNotification(
            'canopy_member_removed',
            removed.userId,
            { canopyName: canopy.name },
            removed.language,
            {}
          )
          return { canopy, notification }
        })
    )

    yield* dispatchNow(notification)

    return yield* canopyView(canopy.id, userId)
  }
)
