import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { confirmHandler } from '@lily/mcp/auth/confirm'
import {
  type AuthorizationCode,
  type OAuthClient,
  OAuthRepository,
} from '@lily/mcp/auth/oauth-repository'
import { OAuthServiceLive } from '@lily/mcp/auth/oauth-service'
import { verifyHandler } from '@lily/mcp/auth/verify'
import { ConfigProvider, Effect, Layer, Option } from 'effect'
import { Cookies, HttpServerRequest, HttpServerResponse } from 'effect/http'
import { describe, expect, it } from 'vitest'

const SERVER_URL = 'http://localhost:3001'
const REDIRECT_URI = 'https://client.example/callback'

const client: OAuthClient = {
  client_id: 'client-1',
  redirect_uris: [REDIRECT_URI],
}

const authorizationParams = {
  client_id: client.client_id,
  redirect_uri: REDIRECT_URI,
  code_challenge: 'challenge-1',
  code_challenge_method: 'S256',
  state: 'state-1',
  scope: 'plants:read',
  resource: `${SERVER_URL}/mcp`,
}

const authResponse = {
  user: {
    id: 'user-1',
    email: 'alice@example.com',
    name: null,
    firstName: null,
    lastName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: 'user' as const,
    status: 'active' as const,
  },
  accessToken: 'api-jwt',
  refreshToken: 'api-refresh',
  expiresIn: 3600,
}

const makeHarness = () => {
  const magicLinks: Array<{ email: string; callbackUrl: string }> = []
  const serviceTokenCalls: string[] = []
  const authCodes: AuthorizationCode[] = []

  const layer = Layer.mergeAll(
    OAuthServiceLive.pipe(
      Layer.provideMerge(
        Layer.mock(OAuthRepository)({
          getClient: (id) =>
            Effect.succeed(
              id === client.client_id ? Option.some(client) : Option.none()
            ),
          saveAuthorizationCode: (code) =>
            Effect.sync(() => {
              authCodes.push(code)
            }),
          upsertUserApiCredentials: () => Effect.void,
        })
      )
    ),
    createMockApiClient({
      sendMagicLink: (params) =>
        Effect.sync(() => {
          magicLinks.push(params)
          return { message: 'sent' }
        }),
      issueServiceToken: ({ magicLinkCode }) =>
        Effect.sync(() => {
          serviceTokenCalls.push(magicLinkCode)
          return authResponse
        }),
    }),
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        MCP_SERVER_URL: SERVER_URL,
        SERVICE_TOKEN_SECRET: 'test-service-secret',
      })
    )
  )

  const run = (
    handler: typeof confirmHandler | typeof verifyHandler,
    request: Request
  ) =>
    Effect.runPromise(
      handler.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(request)
        ),
        Effect.provide(layer)
      )
    )

  const confirm = (
    params: Record<string, string>,
    email = 'alice@example.com'
  ) =>
    run(
      confirmHandler,
      new Request(`${SERVER_URL}/confirm?${new URLSearchParams(params)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email }).toString(),
      })
    )

  const verify = (url: string, cookie?: string) =>
    run(verifyHandler, new Request(url, { headers: cookie ? { cookie } : {} }))

  return { magicLinks, serviceTokenCalls, authCodes, confirm, verify }
}

const bodyText = (response: HttpServerResponse.HttpServerResponse) =>
  HttpServerResponse.toWeb(response).text()

const setCookieHeaders = (response: HttpServerResponse.HttpServerResponse) =>
  Cookies.toSetCookieHeaders(response.cookies)

const cookiePair = (setCookie: string) => setCookie.split(';')[0] ?? ''

const emailedLink = (harness: ReturnType<typeof makeHarness>, code: string) =>
  `${harness.magicLinks[0]?.callbackUrl}&code=${code}`

describe('magic link binding', () => {
  it('POST /confirm sends no email when redirect_uri is not registered', async () => {
    const harness = makeHarness()

    const response = await harness.confirm({
      ...authorizationParams,
      redirect_uri: 'https://attacker.example/callback',
    })

    expect(response.status).toBe(400)
    expect(harness.magicLinks).toEqual([])
  })

  it('GET /verify without the binding cookie spends neither the magic link nor an auth code', async () => {
    const harness = makeHarness()
    await harness.confirm(authorizationParams)

    const response = await harness.verify(emailedLink(harness, 'magic-1'))

    expect(response.status).toBe(400)
    expect(await bodyText(response)).toContain('same browser')
    expect(harness.serviceTokenCalls).toEqual([])
    expect(harness.authCodes).toEqual([])
  })

  it('GET /verify with a cookie from another authorization attempt is refused', async () => {
    const harness = makeHarness()
    await harness.confirm(authorizationParams)
    const [firstLink] = harness.magicLinks
    const otherAttempt = await harness.confirm(
      { ...authorizationParams, code_challenge: 'challenge-2' },
      'bob@example.com'
    )
    const otherCookie = cookiePair(setCookieHeaders(otherAttempt)[0] ?? '')

    const response = await harness.verify(
      `${firstLink?.callbackUrl}&code=magic-1`,
      otherCookie
    )

    expect(response.status).toBe(400)
    expect(harness.serviceTokenCalls).toEqual([])
    expect(harness.authCodes).toEqual([])
  })

  it('completes in the browser that started the authorization', async () => {
    const harness = makeHarness()

    const confirmed = await harness.confirm(authorizationParams)
    expect(confirmed.status).toBe(200)

    const [setCookie] = setCookieHeaders(confirmed)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)

    const callbackUrl = new URL(harness.magicLinks[0]?.callbackUrl ?? '')
    expect(callbackUrl.origin + callbackUrl.pathname).toBe(
      `${SERVER_URL}/verify`
    )
    expect([...callbackUrl.searchParams.keys()]).toEqual(['pending'])

    const response = await harness.verify(
      emailedLink(harness, 'magic-1'),
      cookiePair(setCookie ?? '')
    )

    expect(response.status).toBe(302)
    const location = new URL(response.headers.location ?? '')
    expect(location.origin + location.pathname).toBe(REDIRECT_URI)
    expect(location.searchParams.get('state')).toBe('state-1')
    expect(harness.serviceTokenCalls).toEqual(['magic-1'])
    expect(harness.authCodes).toHaveLength(1)
    expect(location.searchParams.get('code')).toBe(
      harness.authCodes[0]?.authorizationCode
    )
    expect(harness.authCodes[0]).toMatchObject({
      clientId: client.client_id,
      userId: 'user-1',
      redirectUri: REDIRECT_URI,
      codeChallenge: 'challenge-1',
      scopes: ['plants:read'],
      state: 'state-1',
      resource: `${SERVER_URL}/mcp`,
    })
    expect(setCookieHeaders(response)[0]).toMatch(/Max-Age=0|Expires=/i)
  })
})
