import { HttpApiBuilder, HttpServerResponse } from '@effect/platform'
import { BunContext } from '@effect/platform-bun'
import type { Api } from '@lily/api/api'
import { MagicLinkRepositoryLive } from '@lily/api/repositories/magic-link.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { AuthService } from '@lily/api/services/auth/service'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
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
          authService.sendMagicLink(payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('magicLinkCallback', ({ urlParams }) =>
          Effect.gen(function* () {
            const result = yield* authService.magicLinkCallback(urlParams)
            // Return a redirect response
            return HttpServerResponse.redirect(result.redirectUrl, {
              status: 302,
            })
          }).pipe(withInfraErrorsAsDefect)
        )
        .handle('verifyMagicLink', ({ payload }) =>
          authService.verifyMagicLink(payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('refreshToken', ({ payload }) =>
          authService.refreshToken(payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('getCurrentUser', () =>
          authService.getCurrentUser().pipe(withInfraErrorsAsDefect)
        )
        .handle('logout', () =>
          authService.logout().pipe(withInfraErrorsAsDefect)
        )
        .handle('setUsername', ({ payload }) =>
          authService.setUsername(payload).pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(AuthService.Default),
    Layer.provide(AuthenticationLive),
    Layer.provide(MagicLinkRepositoryLive),
    Layer.provide(RefreshTokenRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(JWTServiceLive),
    Layer.provide(RateLimiterServiceLive),
    Layer.provide(BunContext.layer)
  )
