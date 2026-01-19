import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  AuthResponse,
  LogoutResponse,
  MagicLinkRequest,
  MagicLinkSentResponse,
  MagicLinkVerifyRequest,
  RefreshTokenRequest,
  RefreshTokenResponse,
  UsernameRequest,
  UserProfile,
} from '@lily/shared/auth'
import { DatabaseError } from '@lily/shared/errors/database'
import { Schema } from 'effect'

// Auth error schemas
const AuthError = Schema.Struct({ message: Schema.String })

// Define the Auth API group
export const AuthApi = HttpApiGroup.make('auth')
  .add(
    // POST /auth/magic-link - Send magic link email
    HttpApiEndpoint.post('sendMagicLink')`/magic-link`
      .setPayload(MagicLinkRequest)
      .addSuccess(MagicLinkSentResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(RateLimitExceededError, { status: 429 })
  )
  .add(
    // GET /auth/magic-link/callback - Browser callback from email click
    // Redirects to lily://verify?code=<token>
    HttpApiEndpoint.get('magicLinkCallback')`/magic-link/callback`
      .setUrlParams(
        Schema.Struct({
          token: Schema.String,
        })
      )
      .addSuccess(
        Schema.Struct({
          redirectUrl: Schema.String,
        })
      )
      .addError(AuthError, { status: 400 })
  )
  .add(
    // POST /auth/verify - Exchange magic link code for tokens (app calls this)
    HttpApiEndpoint.post('verifyMagicLink')`/verify`
      .setPayload(MagicLinkVerifyRequest)
      .addSuccess(AuthResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(AuthError, { status: 400 })
      .addError(RateLimitExceededError, { status: 429 })
  )
  .add(
    // POST /auth/refresh - Refresh access token using refresh token
    HttpApiEndpoint.post('refreshToken')`/refresh`
      .setPayload(RefreshTokenRequest)
      .addSuccess(RefreshTokenResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(AuthError, { status: 401 })
  )
  .add(
    // GET /auth/me - Get current user profile (requires auth)
    HttpApiEndpoint.get('getCurrentUser')`/me`
      .addSuccess(UserProfile)
      .addError(DatabaseError, { status: 500 })
      .addError(AuthError, { status: 401 })
      .middleware(Authentication)
  )
  .add(
    // POST /auth/logout - Revoke refresh tokens and logout
    HttpApiEndpoint.post('logout')`/logout`
      .addSuccess(LogoutResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(AuthError, { status: 401 })
      .middleware(Authentication)
  )
  .add(
    // POST /auth/username - Set or update username (requires auth)
    HttpApiEndpoint.post('setUsername')`/username`
      .setPayload(UsernameRequest)
      .addSuccess(UserProfile)
      .addError(DatabaseError, { status: 500 })
      .addError(AuthError, { status: 400 })
      .addError(AuthError, { status: 401 })
      .middleware(Authentication)
  )
  .prefix('/auth')
