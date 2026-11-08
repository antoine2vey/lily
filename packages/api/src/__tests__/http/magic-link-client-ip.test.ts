import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockEmailService } from '@lily/api/__tests__/mocks/email.service'
import { createMockMagicLinkRepository } from '@lily/api/__tests__/mocks/magic-link.repository'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import type { Api } from '@lily/api/api'
import { AuthApi } from '@lily/api/services/auth/api'
import { MagicLinkConfig } from '@lily/api/services/auth/endpoints/send-magic-link'
import { AuthApiLive } from '@lily/api/services/auth/handlers'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { RATE_LIMITS } from '@lily/api/services/rate-limiter/service'
import { Effect, FileSystem, Layer, Path } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterEach, describe, expect, it } from 'vitest'

const TestApi = HttpApi.make('magicLinkClientIp').add(AuthApi)

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
      Layer.provide(AuthApiLive(TestApi as unknown as Api)),
      Layer.provide(AuthLive),
      Layer.provide(
        Layer.mergeAll(
          createMockMagicLinkRepository({ magicLinks: [] }),
          createMockRateLimiterService(),
          createMockEmailService(),
          MockAlerterLive,
          Layer.succeed(MagicLinkConfig, {
            disableVerification: false,
            reviewerEmails: [],
          })
        )
      ),
      Layer.provide(PlatformLive)
    ) as unknown as Layer.Layer<never>,
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
        new Request('http://lily.test/auth/magic-link', {
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
