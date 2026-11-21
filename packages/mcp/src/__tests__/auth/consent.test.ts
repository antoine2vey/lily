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
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const SERVER_URL = 'http://localhost:3001'
const CLIENT_ID = 'client-1'
const CHATGPT = 'https://chatgpt.com/connector_platform_oauth_redirect'

const WARNING =
  'Your device picks the app that opens this link, and that app may load a website. Lily cannot check which app it is.'

type Registered = Omit<OAuthClient, 'client_id' | 'redirect_uris'>

const render = async (
  getClient: OAuthRepository['Service']['getClient'],
  params: Record<string, string>
) => {
  const response = await Effect.runPromise(
    consentHandler.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(
          new Request(`${SERVER_URL}/consent?${new URLSearchParams(params)}`)
        )
      ),
      Effect.provide(
        Layer.mergeAll(
          OAuthServiceLive.pipe(
            Layer.provide(Layer.mock(OAuthRepository)({ getClient }))
          ),
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ MCP_SERVER_URL: SERVER_URL })
          )
        )
      )
    )
  )
  return {
    status: response.status,
    html: await HttpServerResponse.toWeb(response).text(),
  }
}

const paramsFor = (redirectUri: string) => ({
  client_id: CLIENT_ID,
  redirect_uri: redirectUri,
  code_challenge: 'challenge-1',
  code_challenge_method: 'S256',
  state: 'state-1',
})

/** The page a user gets when a client that registered `redirectUri` asks for it. */
const consentPage = (redirectUri: string, registered: Registered = {}) =>
  render(
    (id) =>
      Effect.succeed(
        id === CLIENT_ID
          ? Option.some({
              ...registered,
              client_id: CLIENT_ID,
              redirect_uris: [redirectUri],
            })
          : Option.none()
      ),
    paramsFor(redirectUri)
  )

const inner = (html: string, pattern: RegExp) =>
  pipe(
    html,
    String.match(pattern),
    Option.flatMap((match) => Array.get(match, 1))
  )

const text = (fragment: Option.Option<string>) =>
  pipe(
    fragment,
    Option.map(String.replace(/<[^>]+>/g, '')),
    Option.map(String.replace(/\s+/g, ' ')),
    Option.map(String.trim),
    Option.getOrElse(() => '')
  )

const h1 = (html: string) => inner(html, /<h1>([\s\S]*?)<\/h1>/)
const headline = (html: string) => text(h1(html))
const headlinePart = (html: string, pattern: RegExp) =>
  pipe(
    h1(html),
    Option.flatMap((fragment) => inner(fragment, pattern)),
    Option.getOrElse(() => '')
  )
const muted = (html: string) =>
  headlinePart(html, /<span class="host-lead">([^<]*)<\/span>/)
const emphasized = (html: string) =>
  headlinePart(html, /<strong>([^<]*)<\/strong>/)
const details = (html: string) =>
  pipe(
    html,
    String.matchAll(/<p class="detail">([\s\S]*?)<\/p>/g),
    Array.fromIterable,
    Array.map((match) => text(Array.get(match, 1)))
  )
const link = (html: string) =>
  inner(html, /<pre class="link">([\s\S]*?)<\/pre>/)
const handoff = (html: string) =>
  text(inner(html, /<div class="info">([\s\S]*?)<\/div>/))

describe('GET /consent', () => {
  describe('what the client says about itself', () => {
    it.each([
      ['a plain name', { client_name: 'ChatGPT' }],
      ['a name with markup', { client_name: '<b>ChatGPT</b>' }],
      [
        'a name with direction controls',
        { client_name: 'ChatGPT. Lily has verified this app.\u202E' },
      ],
      [
        'a name with filler characters',
        { client_name: 'ChatGPT”.\u3164\u3164\u3164\u3164\u3164Lily verified' },
      ],
      [
        'a name with combining marks',
        { client_name: 'ChatGPT Connecto\u035F\u0362\u035Cr\u035F\u0362-app' },
      ],
      ['a name with control characters', { client_name: 'Chat\u0007GPT\n\n' }],
      [
        'a website and a logo',
        {
          client_uri: 'https://chatgpt.com',
          logo_uri: 'https://chatgpt.com/logo.png',
        },
      ],
    ])('does not change the page for %s', async (_, registered) => {
      const withIt = await consentPage(CHATGPT, registered)
      const without = await consentPage(CHATGPT)

      expect(withIt.html).toBe(without.html)
    })
  })

  describe('a website', () => {
    it('names the host the authorization goes to', async () => {
      const { status, html } = await consentPage(CHATGPT)

      expect(status).toBe(200)
      expect(headline(html)).toBe('chatgpt.com wants to access your plants')
      expect(details(html)).toEqual([])
      expect(link(html)).toEqual(Option.none())
      expect(handoff(html)).toBe(
        'A magic link will be sent to your email. Click it to connect, and Lily will send you on to that website.'
      )
    })

    it.each([
      ['a port', 'https://chatgpt.com:8443/callback', '', 'chatgpt.com:8443'],
      [
        'a subdomain',
        'https://app.acme.example/callback',
        'app.',
        'acme.example',
      ],
      [
        'many labels',
        'https://chatgpt.com.sign-in.evil.example/callback',
        'chatgpt.com.sign-in.',
        'evil.example',
      ],
      [
        'a two-label public suffix',
        'https://evil.co.uk/callback',
        'evil.',
        'co.uk',
      ],
      ['one label', 'http://intranet/callback', '', 'intranet'],
      ['a trailing dot', 'https://chatgpt.com./callback', '', 'chatgpt.com.'],
      [
        'a trailing dot and a port',
        'https://login.chatgpt.com.:8443/callback',
        'login.',
        'chatgpt.com.:8443',
      ],
      [
        'an IPv4 address',
        'https://93.184.216.34:8080/callback',
        '',
        '93.184.216.34:8080',
      ],
      [
        'an IPv6 address',
        'http://[2001:db8::1]:8080/callback',
        '',
        '[2001:db8::1]:8080',
      ],
      [
        'a lookalike letter, in its ASCII form',
        'https://сhatgpt.com/callback',
        '',
        'xn--hatgpt-hrf.com',
      ],
      [
        'a 15,500-character label',
        `https://chatgpt.com.${'a'.repeat(15500)}.evil.example/callback`,
        `chatgpt.com.${'a'.repeat(15500)}.`,
        'evil.example',
      ],
    ])(
      'shows the whole host and sets its end apart, for a host with %s',
      async (_, redirectUri, lead, end) => {
        const { html } = await consentPage(redirectUri)

        expect(headline(html)).toBe(`${lead}${end} wants to access your plants`)
        expect(muted(html)).toBe(lead)
        expect(emphasized(html)).toBe(end)
      }
    )

    it('escapes every part of the host', async () => {
      const { html } = await consentPage(
        'https://x"y&z\'.a"b&c\'.example/callback'
      )

      expect(muted(html)).toBe('x&quot;y&amp;z&#39;.')
      expect(emphasized(html)).toBe('a&quot;b&amp;c&#39;.example')
    })
  })

  describe('an app on this device', () => {
    it.each([
      ['http://localhost:6274/cb', 'localhost:6274'],
      ['https://localhost/cb', 'localhost'],
      ['http://127.0.0.1:33418/', '127.0.0.1:33418'],
      ['http://127.0.0.53:8080/cb', '127.0.0.53:8080'],
      ['http://[::1]:8080/cb', '[::1]:8080'],
    ])('is what a loopback redirect to %s reads as', async (uri, address) => {
      const { status, html } = await consentPage(uri)

      expect(status).toBe(200)
      expect(headline(html)).toBe(
        'An app on this device wants to access your plants'
      )
      expect(details(html)).toEqual([`It is waiting at ${address}.`])
      expect(link(html)).toEqual(Option.none())
      expect(handoff(html)).toBe(
        'A magic link will be sent to your email. Click it to connect, and Lily will hand the connection to that app.'
      )
    })

    it.each([
      ['http://127.0.0.1.evil.example/', '127.0.0.1.evil.example'],
      ['http://localhost.evil.example/', 'localhost.evil.example'],
      ['http://evillocalhost/', 'evillocalhost'],
      ['http://128.0.0.1/', '128.0.0.1'],
      ['http://10.127.0.1/', '10.127.0.1'],
      ['http://localhost@evil.example/', 'evil.example'],
      ['http://127.0.0.1:80@evil.example/', 'evil.example'],
      ['http://127.evil.example/', '127.evil.example'],
      ['http://127.evil.example1/', '127.evil.example1'],
      ['http://127.evil.1example/', '127.evil.1example'],
    ])('is not what the website %s reads as', async (uri, host) => {
      const { html } = await consentPage(uri)

      expect(headline(html)).toBe(`${host} wants to access your plants`)
      expect(html).not.toContain('on this device')
    })

    it.each([
      ['cursor://localhost/cb'],
      ['cursor://127.0.0.1:6274/cb'],
      ['cursor://[::1]/cb'],
    ])('is not what the custom-scheme link %s reads as', async (uri) => {
      const { html } = await consentPage(uri)

      expect(headline(html)).toBe('An app wants to access your plants')
      expect(link(html)).toEqual(Option.some(uri))
      expect(html).not.toContain('on this device')
    })
  })

  describe('any other link', () => {
    it.each([
      ['an app scheme', 'cursor://anysphere.cursor-retrieval/oauth/callback'],
      ['a browser scheme', 'googlechromes://evil.example/callback'],
      ['a websocket scheme', 'ws://evil.example/callback'],
      ['a scheme that reads like https', 'https.://chatgpt.com/cb'],
      ['a scheme that reads like a host', 'chatgpt.com:443'],
      ['a query and no host', 'microsoft-edge:?url=https://evil.example/cb'],
      ['a path and no host', 'microsoft-edge:https://evil.example/cb'],
      [
        'a fragment',
        'intent://evil.example/cb#Intent;scheme=https;S.browser_fallback_url=https%3A%2F%2Fevil.example%2Fcb;end',
      ],
      [
        'a port, a path, a query and a fragment',
        'myapp://host:8080/a/b?x=1;y=2#fragment',
      ],
    ])(
      'shows the link whole under a headline that repeats none of it, for %s',
      async (_, uri) => {
        const { status, html } = await consentPage(uri)

        expect(status).toBe(200)
        expect(html).toContain('<h1>An app wants to access your plants</h1>')
        expect(details(html)).toEqual([
          'Lily will open this link, which the app chose:',
          WARNING,
        ])
        expect(link(html)).toEqual(Option.some(uri))
        expect(handoff(html)).toBe(
          'A magic link will be sent to your email. Click it to connect, and Lily will open that link.'
        )
      }
    )

    it('escapes the link', async () => {
      const { html } = await consentPage(
        'x:<b title="a">&\'</b><i title="b">&\'</i>'
      )

      expect(link(html)).toEqual(
        Option.some(
          'x:&lt;b title=&quot;a&quot;&gt;&amp;&#39;&lt;/b&gt;&lt;i title=&quot;b&quot;&gt;&amp;&#39;&lt;/i&gt;'
        )
      )
    })

    it('shows the link as the browser will follow it, in ASCII', async () => {
      const { html } = await consentPage(
        'x://h\u00E9st/p\u0301\u035F\u0007?q=\u3164\u007F#f\u202E'
      )

      expect(link(html)).toEqual(
        Option.some('x://h%C3%A9st/p%CC%81%CD%9F%07?q=%E3%85%A4%7F#f%E2%80%AE')
      )
      expect(html).toMatch(/^[\n\x20-\x7E]*$/)
    })

    it('keeps its warning off a website and an app on this device', async () => {
      const website = await consentPage(CHATGPT)
      const loopback = await consentPage('http://localhost:6274/cb')

      expect(website.html).not.toContain(WARNING)
      expect(loopback.html).not.toContain(WARNING)
    })
  })

  it('posts the email to /confirm with the request it validated', async () => {
    const { html } = await consentPage(CHATGPT)

    expect(html).toContain(
      '<form id="login-form" action="/confirm?client_id=client-1&amp;redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect&amp;code_challenge=challenge-1&amp;code_challenge_method=S256&amp;state=state-1" method="POST">'
    )
  })

  it('refuses a redirect_uri the client did not register', async () => {
    const { status, html } = await render(
      () =>
        Effect.succeedSome({ client_id: CLIENT_ID, redirect_uris: [CHATGPT] }),
      paramsFor('https://elsewhere.example/callback')
    )

    expect(status).toBe(400)
    expect(html).toContain('<h2>Cannot connect to Lily</h2>')
    expect(html).toContain('redirect_uri does not match registered URIs')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('elsewhere.example')
  })

  it('refuses an unknown client', async () => {
    const { status, html } = await render(
      () => Effect.succeedNone,
      paramsFor(CHATGPT)
    )

    expect(status).toBe(400)
    expect(html).toContain('<h2>Cannot connect to Lily</h2>')
    expect(html).toContain('Unknown client')
    expect(html).not.toContain('<form')
  })

  it('answers 500 without a form when the client lookup fails', async () => {
    const { status, html } = await render(
      () =>
        Effect.fail(
          new SqlError({
            reason: new UnknownError({
              cause: new Error('database unreachable'),
              message: 'database unreachable',
            }),
          })
        ),
      paramsFor(CHATGPT)
    )

    expect(status).toBe(500)
    expect(html).toContain('<h2>Cannot connect to Lily</h2>')
    expect(html).toContain('Something went wrong.')
    expect(html).not.toContain('database unreachable')
    expect(html).not.toContain('<form')
  })
})
