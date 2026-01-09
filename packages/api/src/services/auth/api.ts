import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import {
  AuthResponse,
  MagicLinkRequest,
  MagicLinkVerifyRequest,
  ResendVerificationRequest,
  ResendVerificationResponse,
  UsernameRequest,
  UserProfile,
  VerifyEmailRequest,
  VerifyEmailResponse,
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
  .add(
    // POST /auth/email/resend-verification - Resend verification email
    HttpApiEndpoint.post('resendVerificationEmail')`/email/resend-verification`
      .setPayload(ResendVerificationRequest)
      .addSuccess(ResendVerificationResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
  )
  .add(
    // POST /auth/email/verify - Verify email with token
    HttpApiEndpoint.post('verifyEmail')`/email/verify`
      .setPayload(VerifyEmailRequest)
      .addSuccess(VerifyEmailResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
  )
  .add(
    // POST /auth/refresh - Refresh access token using session
    HttpApiEndpoint.post('refreshToken')`/refresh`
      .addSuccess(Schema.Struct({ accessToken: Schema.String }))
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/auth')
