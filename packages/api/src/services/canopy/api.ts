import { Authentication } from '@lily/api/services/auth/middleware.types'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  AlreadyInCanopyError,
  Canopy,
  CanopyFullError,
  CanopyInvitationView,
  CanopyInvite,
  CanopyInviteExpiredError,
  CanopyInviteeAlreadyMemberError,
  CanopyInviteNotFoundError,
  CanopyInvitePreview,
  CanopyInviteTokenRequest,
  CanopyMemberNotFoundError,
  CanopyNotFoundError,
  CanopyResponse,
  CreateCanopyRequest,
  NotCanopyOwnerError,
  SendCanopyInvitationRequest,
  UpdateCanopyRequest,
  UserNotFoundError,
} from '@lily/shared'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const guidParam = Schema.String.check(Schema.isGUID())

export const CanopyApi = HttpApiGroup.make('canopy')
  .add(
    HttpApiEndpoint.post('createCanopy', '/canopies', {
      payload: CreateCanopyRequest,
      success: Canopy.pipe(HttpApiSchema.status(201)),
      error: [AlreadyInCanopyError, CanopyNotFoundError],
    })
  )
  .add(
    HttpApiEndpoint.get('getMyCanopy', '/canopies/me', {
      success: CanopyResponse,
    })
  )
  .add(
    HttpApiEndpoint.patch('updateMyCanopy', '/canopies/me', {
      payload: UpdateCanopyRequest,
      success: Canopy,
      error: [CanopyNotFoundError, NotCanopyOwnerError],
    })
  )
  .add(
    HttpApiEndpoint.delete('deleteMyCanopy', '/canopies/me', {
      success: Schema.Void,
      error: [CanopyNotFoundError, NotCanopyOwnerError],
    })
  )
  .add(
    HttpApiEndpoint.post('leaveMyCanopy', '/canopies/me/leave', {
      success: Schema.Void,
      error: CanopyNotFoundError,
    })
  )
  .add(
    HttpApiEndpoint.delete(
      'removeCanopyMember',
      '/canopies/me/members/:userId',
      {
        params: { userId: guidParam },
        success: Canopy,
        error: [
          CanopyNotFoundError,
          NotCanopyOwnerError,
          CanopyMemberNotFoundError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post('createCanopyInvite', '/canopies/me/invites', {
      success: CanopyInvite.pipe(HttpApiSchema.status(201)),
      error: CanopyNotFoundError,
    })
  )
  .add(
    HttpApiEndpoint.delete('revokeCanopyInvite', '/canopies/me/invites', {
      success: Schema.Void,
      error: CanopyNotFoundError,
    })
  )
  .add(
    HttpApiEndpoint.post('acceptCanopyInvite', '/canopy-invites/accept', {
      payload: CanopyInviteTokenRequest,
      success: Canopy,
      error: [
        CanopyInviteNotFoundError,
        CanopyInviteExpiredError,
        AlreadyInCanopyError,
        CanopyFullError,
        CanopyNotFoundError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post('sendCanopyInvitation', '/canopies/me/invitations', {
      payload: SendCanopyInvitationRequest,
      success: Canopy,
      error: [
        CanopyNotFoundError,
        UserNotFoundError,
        CanopyInviteeAlreadyMemberError,
        CanopyFullError,
        RateLimitExceededError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete(
      'withdrawCanopyInvitation',
      '/canopies/me/invitations/:invitationId',
      {
        params: { invitationId: guidParam },
        success: Canopy,
        error: [CanopyNotFoundError, CanopyInviteNotFoundError],
      }
    )
  )
  .add(
    HttpApiEndpoint.get(
      'getCanopyInvitation',
      '/canopy-invitations/:invitationId',
      {
        params: { invitationId: guidParam },
        success: CanopyInvitationView,
        error: CanopyInviteNotFoundError,
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      'acceptCanopyInvitation',
      '/canopy-invitations/:invitationId/accept',
      {
        params: { invitationId: guidParam },
        success: Canopy,
        error: [
          CanopyInviteNotFoundError,
          CanopyInviteExpiredError,
          AlreadyInCanopyError,
          CanopyFullError,
          CanopyNotFoundError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      'declineCanopyInvitation',
      '/canopy-invitations/:invitationId/decline',
      {
        params: { invitationId: guidParam },
        success: Schema.Void,
        error: CanopyInviteNotFoundError,
      }
    )
  )
  .middleware(Authentication)

export const CanopyInvitePreviewHeaders = Schema.Struct({
  'x-real-ip': Schema.optional(Schema.String),
  'cf-connecting-ip': Schema.optional(Schema.String),
})

export const CanopyInvitesApi = HttpApiGroup.make('canopy-invites').add(
  HttpApiEndpoint.post('previewCanopyInvite', '/canopy-invites/preview', {
    headers: CanopyInvitePreviewHeaders,
    payload: CanopyInviteTokenRequest,
    success: CanopyInvitePreview,
    error: [
      CanopyInviteNotFoundError,
      CanopyInviteExpiredError,
      RateLimitExceededError,
    ],
  })
)
