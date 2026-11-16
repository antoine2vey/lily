import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockEmailService } from '@lily/api/__tests__/mocks/email.service'
import { createMockJWTService } from '@lily/api/__tests__/mocks/jwt.service'
import { createMockMagicLinkRepository } from '@lily/api/__tests__/mocks/magic-link.repository'
import { createMockOAuthIdentityRepository } from '@lily/api/__tests__/mocks/oauth-identity.repository'
import { createMockOAuthVerifier } from '@lily/api/__tests__/mocks/oauth-verifier.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockRefreshTokenRepository } from '@lily/api/__tests__/mocks/refresh-token.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { Api } from '@lily/api/api'
import { MagicLinkConfig } from '@lily/api/services/auth/endpoints/send-magic-link'
import { AuthApiLive } from '@lily/api/services/auth/handlers'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { RATE_LIMITS } from '@lily/api/services/rate-limiter/service'
import { API_PREFIX } from '@lily/shared'
import { Effect, FileSystem, Layer, Path } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterEach, describe, expect, it } from 'vitest'

const TestApi = HttpApi.make('Api').add(Api.groups.auth)

const AuthLive = Layer.succeed(
  Authentication,
  Authentication.of({
    bearer: (httpEffect) =>
      Effect.provideService(httpEffect, CurrentUser, mockUserProfile),
  })
)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const makeHandler = () =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(AuthApiLive(Api)),
      Layer.provide(AuthLive),
      HttpRouter.provideRequest(
        Layer.mergeAll(
          createMockMagicLinkRepository({ magicLinks: [] }),
          createMockRateLimiterService(),
          createMockEmailService(),
          createMockJWTService(),
          createMockOAuthIdentityRepository().layer,
          createMockOAuthVerifier(),
          createMockRefreshTokenRepository(),
          createMockUserRepository([]),
          MockAlerterLive,
          Layer.succeed(MagicLinkConfig, {
            disableVerification: false,
            reviewerEmails: [],
          })
        )
      ),
      Layer.provide(PlatformLive)
    ),
    { disableLogger: true }
  )

describe('POST /magic-link client IP', () => {
  let web: ReturnType<typeof makeHandler> | undefined

  afterEach(async () => {
    await web?.dispose()
  })

  const send = (email: string, realIp: string) =>
    web
      ?.handler(
        new Request(`http://lily.test${API_PREFIX}/auth/magic-link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-real-ip': realIp },
          body: JSON.stringify({ email }),
        })
      )
      .then((res) => res.status)

  it('limits each proxy-reported client IP on its own', async () => {
    web = makeHandler()
    const { maxRequests } = RATE_LIMITS.MAGIC_LINK_PER_IP

    const statuses: Array<number | undefined> = []
    for (let i = 0; i <= maxRequests; i++) {
      statuses.push(await send(`user${i}@example.com`, '203.0.113.1'))
    }

    expect(statuses.slice(0, maxRequests)).toEqual(
      Array.from({ length: maxRequests }, () => 200)
    )
    expect(statuses[maxRequests]).toBe(429)
    expect(await send('other@example.com', '198.51.100.7')).toBe(200)
  })
})
