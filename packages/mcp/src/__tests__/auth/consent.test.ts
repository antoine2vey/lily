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
const LONG_HOST = `chatgpt.com.${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}.evil.example`

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
    client_id: 'long-host',
    client_name: 'ChatGPT',
    redirect_uris: [`https://${LONG_HOST}/callback`],
  },
  {
    client_id: 'name-with-direction-override',
    client_name: 'ChatGPT. Lily has verified this app.\u202E',
    redirect_uris: ['https://evil.example/callback'],
  },
  {
    client_id: 'name-with-invisible-characters',
    client_name: 'Chat\u200BGPT\u2066\u0007\n',
    redirect_uris: ['https://evil.example/callback'],
  },
  {
    client_id: 'name-only-invisible',
    client_name: '\u202E\u200B',
    redirect_uris: ['https://evil.example/callback'],
  },
  {
    client_id: 'long-name',
    client_name: 'A'.repeat(5000),
    redirect_uris: ['https://evil.example/callback'],
  },
  {
    client_id: 'scheme-browser',
    client_name: 'ChatGPT',
    redirect_uris: ['googlechromes://evil.example/callback'],
  },
  {
    client_id: 'scheme-intent',
    client_name: 'ChatGPT',
    redirect_uris: ['intent://evil.example/callback#Intent;scheme=https;end'],
  },
  {
    client_id: 'scheme-websocket',
    client_name: 'ChatGPT',
    redirect_uris: ['ws://evil.example/callback'],
  },
  {
    client_id: 'scheme-opaque',
    client_name: 'ChatGPT',
    redirect_uris: ['microsoft-edge:https://evil.example/callback'],
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

const UNVERIFIED =
  /<p class="unverified">Lily has not verified that name\.<\/p>/

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

    expect(html).toContain('This app calls itself “<bdi>ChatGPT</bdi>”.')
    expect(html).toMatch(UNVERIFIED)
  })

  it("isolates the client name from Lily's own statement about it", async () => {
    const { html } = await consentPage('name-with-direction-override')

    expect(html).not.toContain('\u202E')
    expect(html).toContain('<bdi>ChatGPT. Lily has verified this app.</bdi>')
    expect(html).toMatch(UNVERIFIED)
  })

  it('drops control and format characters from the client name', async () => {
    const { html } = await consentPage('name-with-invisible-characters')

    expect(html).toContain('<bdi>ChatGPT</bdi>')
  })

  it('treats a name of only invisible characters as no name', async () => {
    const { html } = await consentPage('name-only-invisible')

    expect(html).toContain('This app gave no name.')
    expect(html).not.toContain('<bdi>')
  })

  it('shortens a long client name', async () => {
    const { html } = await consentPage('long-name')

    expect(html).toContain(`<bdi>${'A'.repeat(60)}…</bdi>`)
    expect(html).not.toContain('A'.repeat(61))
    expect(html).toMatch(UNVERIFIED)
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

  it.each([
    ['app', 'cursor://anysphere.cursor-retrieval'],
    ['scheme-browser', 'googlechromes://evil.example'],
    ['scheme-intent', 'intent://evil.example'],
    ['scheme-websocket', 'ws://evil.example'],
    ['scheme-opaque', 'microsoft-edge:https://evil.example/callback'],
  ])(
    'shows where the %s redirect goes without placing it on this device',
    async (clientId, target) => {
      const { status, html } = await consentPage(clientId)

      expect(status).toBe(200)
      expect(headline(html)).toBe(`${target} wants to access your plants`)
      expect(html).not.toContain('on this device')
    }
  )

  it('shows the whole of a long host and sets its last two labels apart', async () => {
    const { html } = await consentPage('long-host')

    expect(headline(html)).toBe(`${LONG_HOST} wants to access your plants`)
    expect(html).toContain(
      '<strong>evil.example</strong> wants to access your plants'
    )
    expect(html).toMatch(/overflow-wrap:\s*anywhere/)
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
