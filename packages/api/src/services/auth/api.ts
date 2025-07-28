import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import {
  AuthResponse,
  MagicLinkRequest,
  MagicLinkVerifyRequest,
  UsernameRequest,
  UserProfile,
} from '@lily/shared/auth'
import { DatabaseError } from '@lily/shared/errors/database'
import { Schema } from 'effect'

// Define the Auth API group
export const AuthApi = HttpApiGroup.make('auth')
  .add(
    // POST /auth/magic-link - Send magic-link email
    HttpApiEndpoint.post('sendMagicLink')`/magic-link`
      .setPayload(MagicLinkRequest)
      .addSuccess(Schema.Struct({ message: Schema.String }))
      .addError(DatabaseError, { status: 500 })
  )
  .add(
    // POST /auth/magic-link/verify - Verify magic-link token
    HttpApiEndpoint.post('verifyMagicLink')`/magic-link/verify`
      .setPayload(MagicLinkVerifyRequest)
      .addSuccess(AuthResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
  )
  .add(
    // GET /auth/me - Get current user profile
    HttpApiEndpoint.get('getCurrentUser')`/me`
      .addSuccess(UserProfile)
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /auth/signout - Invalidate current session
    HttpApiEndpoint.post('signOut')`/signout`
      .addSuccess(Schema.Struct({ message: Schema.String }))
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /auth/username - Set or update user's username
    HttpApiEndpoint.post('setUsername')`/username`
      .setPayload(UsernameRequest)
      .addSuccess(UserProfile)
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/auth')
