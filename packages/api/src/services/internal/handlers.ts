import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { MagicLinkRepositoryLive } from '@lily/api/repositories/magic-link.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { ServiceAuthenticationLive } from '@lily/api/services/internal/middleware.impl'
import { InternalService } from '@lily/api/services/internal/service'
import { JWTServiceLive } from '@lily/api/services/jwt/service'
import { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'
import { Effect, Layer } from 'effect'

export const InternalApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'internal', (handlers) =>
    Effect.gen(function* () {
      const service = yield* InternalService

      return handlers
        .handle('issueServiceToken', ({ payload }) =>
          service.issueServiceToken(payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('sendMagicLink', ({ payload }) =>
          service.sendInternalMagicLink(payload).pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(InternalService.Default),
    Layer.provide(ServiceAuthenticationLive),
    Layer.provide(MagicLinkRepositoryLive),
    Layer.provide(RefreshTokenRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(JWTServiceLive),
    Layer.provide(RateLimiterServiceLive)
  )
