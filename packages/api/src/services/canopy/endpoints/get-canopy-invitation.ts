import { statusAt } from '@lily/api/contexts/canopy'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  type CanopyId,
  type CanopyInvitationView,
  CanopyInviteNotFoundError,
} from '@lily/shared'
import { DateTime, Effect } from 'effect'

export const getCanopyInvitation = Effect.fn(
  'CanopyService.getCanopyInvitation'
)(function* (invitationId: string) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository

  const invitation = yield* repo.findInvitationPreview(invitationId)
  if (invitation === null || invitation.inviteeUserId !== userId) {
    return yield* new CanopyInviteNotFoundError()
  }
  return {
    id: invitation.id,
    canopyId: invitation.canopyId as CanopyId,
    canopyName: invitation.canopyName,
    inviterName: invitation.inviterName,
    memberCount: invitation.memberCount,
    status: statusAt(invitation, DateTime.nowUnsafe()),
    expiresAt: invitation.expiresAt,
  } satisfies CanopyInvitationView
})
