import { consentHandler } from '@lily/mcp/auth/consent'
import {
  type OAuthClient,
  OAuthRepository,
} from '@lily/mcp/auth/oauth-repository'
import { OAuthServiceLive } from '@lily/mcp/auth/oauth-service'
import {
  Array,
  ConfigProvider,
  Effect,
  Layer,
  Option,
  pipe,
  String,
} from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'
import { describe, expect, it } from 'vitest'

const SERVER_URL = 'http://localhost:3001'

const clients: readonly OAuthClient[] = [
  {
    client_id: 'web',
    client_name: 'ChatGPT',
    redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
  },
  {
    client_id: 'loopback',
    client_name: 'MCP Inspector',
    redirect_uris: ['http://localhost:6274/oauth/callback'],
  },
  {
    client_id: 'app',
    client_name: 'Cursor',
    redirect_uris: ['cursor://anysphere.cursor-retrieval/oauth/callback'],
  },
  {
    client_id: 'lookalike',
    client_name: 'ChatGPT',
    redirect_uris: ['https://сhatgpt.com/callback'],
  },
  {
    client_id: 'web-port',
    client_name: 'ChatGPT',
    redirect_uris: ['https://chatgpt.com:8443/callback'],
  },
  {
    client_id: 'loopback-ipv4',
    client_name: 'MCP Inspector',
    redirect_uris: ['http://127.0.0.1:8080/callback'],
  },
  {
    client_id: 'localhost-subdomain',
    client_name: 'MCP Inspector',
    redirect_uris: ['http://localhost.evil.example/callback'],
  },
  {
    client_id: '127-subdomain',
    client_name: 'MCP Inspector',
    redirect_uris: ['http://127.evil.example/callback'],
  },
  {
    client_id: 'hostile',
    client_name: '<script>alert(1)</script>',
    redirect_uris: ['https://a"b&c.example/callback'],
  },
]

const layer = Layer.mergeAll(
  OAuthServiceLive.pipe(
    Layer.provide(
      Layer.mock(OAuthRepository)({
        getClient: (id) =>
          Effect.succeed(Array.findFirst(clients, (c) => c.client_id === id)),
      })
    )
  ),
  ConfigProvider.layer(
    ConfigProvider.fromUnknown({ MCP_SERVER_URL: SERVER_URL })
  )
)

const registeredUri = (clientId: string) =>
  Option.getOrElse(
    Option.flatMap(
      Array.findFirst(clients, (c) => c.client_id === clientId),
      (c) => Array.head(c.redirect_uris)
    ),
    () => 'https://chatgpt.com/connector_platform_oauth_redirect'
  )

const consentPage = async (
  clientId: string,
  redirectUri = registeredUri(clientId)
) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: 'challenge-1',
    code_challenge_method: 'S256',
    state: 'state-1',
  })
  const response = await Effect.runPromise(
    consentHandler.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(
          new Request(`${SERVER_URL}/consent?${params}`)
        )
      ),
      Effect.provide(layer)
    )
  )
  return {
    status: response.status,
    html: await HttpServerResponse.toWeb(response).text(),
  }
}

const visibleText = (fragment: string) =>
  pipe(
    fragment,
    String.replace(/<[^>]+>/g, ''),
    String.replace(/\s+/g, ' '),
    String.trim
  )

const element = (html: string, pattern: RegExp) =>
  pipe(
    html,
    String.match(pattern),
    Option.flatMap((match) => Array.get(match, 1)),
    Option.map(visibleText),
    Option.getOrElse(() => '')
  )

const headline = (html: string) => element(html, /<h1>([\s\S]*?)<\/h1>/)
const detail = (html: string) =>
  element(html, /<p class="detail">([\s\S]*?)<\/p>/)

describe('GET /consent', () => {
  it('names the website the authorization goes to', async () => {
    const { status, html } = await consentPage('web')

    expect(status).toBe(200)
    expect(html).toContain(
      '<strong>chatgpt.com</strong> wants to access your plants'
    )
    expect(html).toContain('<form')
  })

  it('presents the client name as unverified', async () => {
    const { html } = await consentPage('web')

    expect(html).toContain('This app calls itself <strong>ChatGPT</strong>')
    expect(html).toContain('Lily has not verified that name')
  })

  it('says an app on this device is asking for a loopback redirect', async () => {
    const { status, html } = await consentPage('loopback')

    expect(status).toBe(200)
    expect(html).toContain('An app on this device wants to access your plants')
    expect(html).toContain('localhost:6274')
  })

  it('shows the port of a website', async () => {
    const { html } = await consentPage('web-port')

    expect(headline(html)).toBe('chatgpt.com:8443 wants to access your plants')
  })

  it('treats a 127.0.0.0/8 address as this device and shows its port', async () => {
    const { html } = await consentPage('loopback-ipv4')

    expect(headline(html)).toBe(
      'An app on this device wants to access your plants'
    )
    expect(detail(html)).toContain('127.0.0.1:8080')
  })

  it.each([
    ['localhost-subdomain', 'localhost.evil.example'],
    ['127-subdomain', '127.evil.example'],
  ])(
    'treats %s as a website and shows its whole host',
    async (clientId, host) => {
      const { html } = await consentPage(clientId)

      expect(headline(html)).toBe(`${host} wants to access your plants`)
      expect(html).not.toContain('on this device')
    }
  )

  it('says an app on this device is asking for an app-scheme redirect', async () => {
    const { status, html } = await consentPage('app')

    expect(status).toBe(200)
    expect(html).toContain('An app on this device wants to access your plants')
    expect(html).toContain('cursor://')
  })

  it('shows a lookalike host in its ASCII form', async () => {
    const { html } = await consentPage('lookalike')

    expect(html).toContain('<strong>xn--hatgpt-hrf.com</strong>')
    expect(html).not.toContain('сhatgpt.com')
  })

  it('escapes the client name and the host', async () => {
    const { html } = await consentPage('hostile')

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('a&quot;b&amp;c.example')
    expect(html).not.toContain('a"b&c.example')
  })

  it('refuses a redirect_uri the client did not register', async () => {
    const { status, html } = await consentPage(
      'web',
      'https://elsewhere.example/callback'
    )

    expect(status).toBe(400)
    expect(html).not.toContain('<form')
    expect(html).not.toContain('elsewhere.example')
  })

  it('refuses an unknown client', async () => {
    const { status, html } = await consentPage('missing')

    expect(status).toBe(400)
    expect(html).not.toContain('<form')
  })
})
