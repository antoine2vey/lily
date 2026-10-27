import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import {
  dropMember,
  lockMyCanopy,
  requireOwner,
} from '@lily/api/services/canopy/helpers/membership'
import { notifyMemberBestEffort } from '@lily/api/services/canopy/helpers/notify-member'
import { CanopyMemberNotFoundError } from '@lily/shared'
import { Array, Effect, Option } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

export const removeCanopyMember = Effect.fn('CanopyService.removeCanopyMember')(
  function* (memberUserId: string) {
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository
    const sql = yield* SqlClient.SqlClient

    const { canopy, removed } = yield* sql.withTransaction(
      Effect.gen(function* () {
        const { canopy, membership } = yield* lockMyCanopy(userId)
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
        yield* dropMember(canopy.id, removed.userId)
        yield* repo.revokeInvite(canopy.id)
        return { canopy, removed }
      })
    )

    yield* notifyMemberBestEffort('canopy_member_removed', removed, {
      canopyName: canopy.name,
    })

    return yield* canopyView(canopy.id, userId)
  }
)
