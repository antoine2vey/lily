import {
  type CanopyInvitationRow,
  type CanopyMembership,
  CanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { changeInvitations } from '@lily/api/services/plants/helpers/plant-change'
import { CanopyInviteNotFoundError } from '@lily/shared'
import { Effect } from 'effect'

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

  const canopyId = yield* changeInvitations(userId)(({ canopy, membership }) =>
    Effect.gen(function* () {
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
