import { Authentication } from '@lily/api/services/auth/middleware.types'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  AuthResponse,
  LogoutResponse,
  MagicLinkRequest,
  MagicLinkSentResponse,
  MagicLinkVerifyRequest,
  OAuthSignInRequest,
  RefreshTokenRequest,
  RefreshTokenResponse,
  UsernameRequest,
  UserProfile,
} from '@lily/shared/auth'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// Auth error schemas
const AuthError = Schema.Struct({ message: Schema.String })

// Define the Auth API group
export const AuthApi = HttpApiGroup.make('auth')
  .add(
    // POST /auth/magic-link - Send magic link email
    HttpApiEndpoint.post('sendMagicLink', '/magic-link', {
      payload: MagicLinkRequest,
      success: MagicLinkSentResponse,
      error: [
        AuthError.pipe(HttpApiSchema.status(400)),
        RateLimitExceededError,
      ],
    })
  )
  .add(
    // GET /auth/magic-link/callback - Browser callback from email click
    // Redirects to lily://verify?code=<token>
    HttpApiEndpoint.get('magicLinkCallback', '/magic-link/callback', {
      query: Schema.Struct({
        token: Schema.String,
      }),
      success: Schema.Struct({
        redirectUrl: Schema.String,
      }),
      error: AuthError.pipe(HttpApiSchema.status(400)),
    })
  )
  .add(
    // POST /auth/verify - Exchange magic link code for tokens (app calls this)
    HttpApiEndpoint.post('verifyMagicLink', '/verify', {
      payload: MagicLinkVerifyRequest,
      success: AuthResponse,
      error: [
        AuthError.pipe(HttpApiSchema.status(400)),
        RateLimitExceededError,
      ],
    })
  )
  .add(
    // POST /auth/oauth/signin - Exchange Apple/Google ID token for our JWT pair
    HttpApiEndpoint.post('oauthSignIn', '/oauth/signin', {
      payload: OAuthSignInRequest,
      success: AuthResponse,
      error: AuthError.pipe(HttpApiSchema.status(400)),
    })
  )
  .add(
    // POST /auth/refresh - Refresh access token using refresh token
    HttpApiEndpoint.post('refreshToken', '/refresh', {
      payload: RefreshTokenRequest,
      success: RefreshTokenResponse,
      error: [
        AuthError.pipe(HttpApiSchema.status(401)),
        RateLimitExceededError,
      ],
    })
  )
  .add(
    // GET /auth/me - Get current user profile (requires auth)
    HttpApiEndpoint.get('getCurrentUser', '/me', {
      success: UserProfile,
      error: AuthError.pipe(HttpApiSchema.status(401)),
    }).middleware(Authentication)
  )
  .add(
    // POST /auth/logout - Revoke refresh tokens and logout
    HttpApiEndpoint.post('logout', '/logout', {
      success: LogoutResponse,
      error: AuthError.pipe(HttpApiSchema.status(401)),
    }).middleware(Authentication)
  )
  .add(
    // POST /auth/username - Set or update username (requires auth)
    HttpApiEndpoint.post('setUsername', '/username', {
      payload: UsernameRequest,
      success: UserProfile,
      error: [
        AuthError.pipe(HttpApiSchema.status(400)),
        AuthError.pipe(HttpApiSchema.status(401)),
      ],
    }).middleware(Authentication)
  )
  .prefix('/auth')
