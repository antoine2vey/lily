import { Authentication } from '@lily/api/services/auth/middleware.types'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  AlreadyInCanopyError,
  Canopy,
  CanopyFullError,
  CanopyInvite,
  CanopyInviteExpiredError,
  CanopyInviteNotFoundError,
  CanopyInvitePreview,
  CanopyInviteTokenRequest,
  CanopyMemberNotFoundError,
  CanopyNotFoundError,
  CanopyResponse,
  CreateCanopyRequest,
  NotCanopyOwnerError,
  UpdateCanopyRequest,
} from '@lily/shared'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const userIdParam = Schema.String.check(Schema.isGUID())

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
        params: { userId: userIdParam },
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
