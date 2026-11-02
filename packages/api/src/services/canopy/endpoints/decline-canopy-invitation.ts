import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { CanopyInviteNotFoundError } from '@lily/shared'
import { Effect } from 'effect'

export const declineCanopyInvitation = Effect.fn(
  'CanopyService.declineCanopyInvitation'
)(function* (invitationId: string) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository

  const invitation = yield* repo.findInvitation(invitationId)
  if (invitation === null || invitation.inviteeUserId !== userId) {
    return yield* new CanopyInviteNotFoundError()
  }
  if (invitation.status === 'declined') return
  const declined = yield* repo.transitionInvitation(
    invitation.id,
    'pending',
    'declined'
  )
  if (declined === null) {
    return yield* new CanopyInviteNotFoundError()
  }
})
