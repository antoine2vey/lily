import {
  type CanopyInvitationRow,
  type CanopyMembership,
  CanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import { CanopyInviteNotFoundError } from '@lily/shared'
import { Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

const mayWithdraw = (
  invitation: CanopyInvitationRow,
  userId: string,
  membership: CanopyMembership
) =>
  invitation.canopyId === membership.canopyId &&
  (invitation.invitedByUserId === userId || membership.role === 'owner')

export const withdrawCanopyInvitation = Effect.fn(
  'CanopyService.withdrawCanopyInvitation'
)(function* (invitationId: string) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  const sql = yield* SqlClient.SqlClient

  const canopyId = yield* sql.withTransaction(
    Effect.gen(function* () {
      const { canopy, membership } = yield* lockMyCanopy(userId)
      const invitation = yield* repo.findInvitation(invitationId)
      if (invitation === null || !mayWithdraw(invitation, userId, membership)) {
        return yield* new CanopyInviteNotFoundError()
      }
      const withdrawn =
        invitation.status === 'withdrawn' ||
        (yield* repo.transitionInvitation(
          invitation.id,
          'pending',
          'withdrawn'
        )) !== null
      if (!withdrawn) {
        return yield* new CanopyInviteNotFoundError()
      }
      return canopy.id
    })
  )

  return yield* canopyView(canopyId, userId)
})
