import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import {
  type OAuthClient,
  OAuthRepository,
} from '@lily/mcp/auth/oauth-repository'
import { OAuthRoutes } from '@lily/mcp/auth/oauth-routes'
import { OAuthServiceLive } from '@lily/mcp/auth/oauth-service'
import { ConfigProvider, Effect, Layer, Option } from 'effect'
import { HttpRouter } from 'effect/http'
import { afterAll, describe, expect, it } from 'vitest'

const SERVER_URL = 'http://localhost:3001'
const REDIRECT_URI = 'https://chatgpt.com/connector_platform_oauth_redirect'

const client: OAuthClient = {
  client_id: 'web',
  client_name: 'ChatGPT',
  redirect_uris: [REDIRECT_URI],
}

const { handler, dispose } = HttpRouter.toWebHandler(
  OAuthRoutes.pipe(
    Layer.provideMerge(
      OAuthServiceLive.pipe(
        Layer.provideMerge(
          Layer.mock(OAuthRepository)({
            getClient: (id) =>
              Effect.succeed(
                id === client.client_id ? Option.some(client) : Option.none()
              ),
          })
        )
      )
    ),
    Layer.provideMerge(createMockApiClient()),
    Layer.provideMerge(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({ MCP_SERVER_URL: SERVER_URL })
      )
    )
  ),
  { disableLogger: true }
)

afterAll(dispose)

const validParams = {
  client_id: client.client_id,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  code_challenge: 'challenge-1',
  code_challenge_method: 'S256',
  state: 'state-1',
  scope: 'plants:read',
}

const authorize = (params: Record<string, string>) =>
  handler(
    new Request(`${SERVER_URL}/oauth/authorize?${new URLSearchParams(params)}`)
  )

const without = (key: keyof typeof validParams) =>
  Object.fromEntries(
    Object.entries(validParams).filter(([name]) => name !== key)
  )

describe('GET /oauth/authorize', () => {
  it('sends a valid request to the consent page with its parameters', async () => {
    const response = await authorize(validParams)

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location') ?? '')
    expect(`${location.origin}${location.pathname}`).toBe(
      `${SERVER_URL}/consent`
    )
    expect(Object.fromEntries(location.searchParams)).toEqual(validParams)
  })

  it('refuses an unknown client', async () => {
    const response = await authorize({ ...validParams, client_id: 'missing' })

    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toMatchObject({ error: 'invalid_client' })
  })

  it('refuses a redirect_uri the client did not register', async () => {
    const response = await authorize({
      ...validParams,
      redirect_uri: 'https://elsewhere.example/callback',
    })

    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('refuses a request without a code_challenge', async () => {
    const response = await authorize(without('code_challenge'))

    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toMatchObject({ error: 'invalid_request' })
  })
})
