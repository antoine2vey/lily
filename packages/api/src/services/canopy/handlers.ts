import type { Api } from '@lily/api/api'
import { acceptCanopyInvitation } from '@lily/api/services/canopy/endpoints/accept-canopy-invitation'
import { acceptCanopyInvite } from '@lily/api/services/canopy/endpoints/accept-canopy-invite'
import { createCanopy } from '@lily/api/services/canopy/endpoints/create-canopy'
import { createCanopyInvite } from '@lily/api/services/canopy/endpoints/create-canopy-invite'
import { declineCanopyInvitation } from '@lily/api/services/canopy/endpoints/decline-canopy-invitation'
import { deleteMyCanopy } from '@lily/api/services/canopy/endpoints/delete-my-canopy'
import { getCanopyInvitation } from '@lily/api/services/canopy/endpoints/get-canopy-invitation'
import { getMyCanopy } from '@lily/api/services/canopy/endpoints/get-my-canopy'
import { leaveMyCanopy } from '@lily/api/services/canopy/endpoints/leave-my-canopy'
import { previewCanopyInvite } from '@lily/api/services/canopy/endpoints/preview-canopy-invite'
import { removeCanopyMember } from '@lily/api/services/canopy/endpoints/remove-canopy-member'
import { revokeCanopyInvite } from '@lily/api/services/canopy/endpoints/revoke-canopy-invite'
import { sendCanopyInvitation } from '@lily/api/services/canopy/endpoints/send-canopy-invitation'
import { updateMyCanopy } from '@lily/api/services/canopy/endpoints/update-my-canopy'
import { withdrawCanopyInvitation } from '@lily/api/services/canopy/endpoints/withdraw-canopy-invitation'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { HttpApiBuilder } from 'effect/http-api'

export const CanopyApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'canopy', (handlers) =>
    handlers
      .handle('createCanopy', ({ payload }) =>
        createCanopy(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('getMyCanopy', () => getMyCanopy().pipe(withInfraErrorsAsDefect))
      .handle('updateMyCanopy', ({ payload }) =>
        updateMyCanopy(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteMyCanopy', () =>
        deleteMyCanopy().pipe(withInfraErrorsAsDefect)
      )
      .handle('leaveMyCanopy', () =>
        leaveMyCanopy().pipe(withInfraErrorsAsDefect)
      )
      .handle('removeCanopyMember', ({ params: { userId } }) =>
        removeCanopyMember(userId).pipe(withInfraErrorsAsDefect)
      )
      .handle('createCanopyInvite', () =>
        createCanopyInvite().pipe(withInfraErrorsAsDefect)
      )
      .handle('revokeCanopyInvite', () =>
        revokeCanopyInvite().pipe(withInfraErrorsAsDefect)
      )
      .handle('acceptCanopyInvite', ({ payload: { token } }) =>
        acceptCanopyInvite(token).pipe(withInfraErrorsAsDefect)
      )
      .handle('sendCanopyInvitation', ({ payload: { inviteeId } }) =>
        sendCanopyInvitation(inviteeId).pipe(withInfraErrorsAsDefect)
      )
      .handle('withdrawCanopyInvitation', ({ params: { invitationId } }) =>
        withdrawCanopyInvitation(invitationId).pipe(withInfraErrorsAsDefect)
      )
      .handle('getCanopyInvitation', ({ params: { invitationId } }) =>
        getCanopyInvitation(invitationId).pipe(withInfraErrorsAsDefect)
      )
      .handle('acceptCanopyInvitation', ({ params: { invitationId } }) =>
        acceptCanopyInvitation(invitationId).pipe(withInfraErrorsAsDefect)
      )
      .handle('declineCanopyInvitation', ({ params: { invitationId } }) =>
        declineCanopyInvitation(invitationId).pipe(withInfraErrorsAsDefect)
      )
  )

export const CanopyInvitesApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'canopy-invites', (handlers) =>
    handlers.handle('previewCanopyInvite', ({ payload: { token }, headers }) =>
      previewCanopyInvite(token, headers).pipe(withInfraErrorsAsDefect)
    )
  )
