import { HttpApiBuilder, HttpServerResponse } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { MagicLinkRepositoryLive } from '@lily/api/repositories/magic-link.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { AuthService } from '@lily/api/services/auth/service'
import { JWTServiceLive } from '@lily/api/services/jwt/service'
import { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'
import { Effect, Layer } from 'effect'

// Implement the Auth API group
export const AuthApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'auth', (handlers) =>
    Effect.gen(function* () {
      const authService = yield* AuthService

      return handlers
        .handle('sendMagicLink', ({ payload }) =>
          authService.sendMagicLink(payload)
        )
        .handle('magicLinkCallback', ({ urlParams }) =>
          Effect.gen(function* () {
            const result = yield* authService.magicLinkCallback(urlParams)
            // Return a redirect response
            return HttpServerResponse.redirect(result.redirectUrl, {
              status: 302,
            })
          })
        )
        .handle('verifyMagicLink', ({ payload }) =>
          authService.verifyMagicLink(payload)
        )
        .handle('refreshToken', ({ payload }) =>
          authService.refreshToken(payload)
        )
        .handle('getCurrentUser', () => authService.getCurrentUser())
        .handle('logout', () => authService.logout())
        .handle('setUsername', ({ payload }) =>
          authService.setUsername(payload)
        )
    })
  ).pipe(
    Layer.provide(AuthService.Default),
    Layer.provide(AuthenticationLive),
    Layer.provide(MagicLinkRepositoryLive),
    Layer.provide(RefreshTokenRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(JWTServiceLive),
    Layer.provide(RateLimiterServiceLive)
  )
