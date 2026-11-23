import { Authentication } from '@lily/api/services/auth/middleware.types'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import { AuthError } from '@lily/shared'
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

export const AuthApi = HttpApiGroup.make('auth')
  .add(
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
    HttpApiEndpoint.post('oauthSignIn', '/oauth/signin', {
      payload: OAuthSignInRequest,
      success: AuthResponse,
      error: AuthError.pipe(HttpApiSchema.status(400)),
    })
  )
  .add(
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
    HttpApiEndpoint.get('getCurrentUser', '/me', {
      success: UserProfile,
      error: AuthError.pipe(HttpApiSchema.status(401)),
    }).middleware(Authentication)
  )
  .add(
    HttpApiEndpoint.post('logout', '/logout', {
      success: LogoutResponse,
      error: AuthError.pipe(HttpApiSchema.status(401)),
    }).middleware(Authentication)
  )
  .add(
    HttpApiEndpoint.post('setUsername', '/username', {
      payload: UsernameRequest,
      success: UserProfile,
      error: [
        AuthError.pipe(HttpApiSchema.status(400)),
        AuthError.pipe(HttpApiSchema.status(401)),
        RateLimitExceededError,
      ],
    }).middleware(Authentication)
  )
  .prefix('/auth')
