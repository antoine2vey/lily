import { parseAuthorizationRequest } from '@lily/mcp/auth/authorization-request'
import { errorPage, escapeHtml } from '@lily/mcp/auth/html'
import { McpServerUrl } from '@lily/mcp/config'
import { Array, Data, Effect, Option, pipe, String } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'

/** Where the authorization code goes, read from the validated redirect URI. */
type Destination = Data.TaggedEnum<{
  Website: { readonly host: string }
  Loopback: { readonly address: string }
  AppScheme: { readonly scheme: string }
}>
const Destination = Data.taggedEnum<Destination>()

const LOOPBACK_IPV4 = /^127\.\d+\.\d+\.\d+$/

const isLoopback = (hostname: string) =>
  hostname === 'localhost' ||
  hostname === '[::1]' ||
  LOOPBACK_IPV4.test(hostname)

// `host` is the parser's ASCII form, so a lookalike shows as punycode
const toDestination = (redirectUri: string): Destination => {
  const url = new URL(redirectUri)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return Destination.AppScheme({
      scheme: pipe(url.protocol, String.slice(0, -1)),
    })
  }
  return isLoopback(url.hostname)
    ? Destination.Loopback({ address: url.host })
    : Destination.Website({ host: url.host })
}

const IP_LITERAL = /^(\[.*\]|\d+(\.\d+){3})(:\d+)?$/
const LAST_TWO_LABELS = /^(.*?)((?:[^.]+\.)?[^.]+\.?(?::\d+)?)$/

// Without a public suffix list the owner's domain is unknown, but it always
// ends the host, so the last two labels get the weight and the rest is muted
const renderHost = (host: string) => {
  const lead = IP_LITERAL.test(host)
    ? ''
    : pipe(
        host,
        String.match(LAST_TWO_LABELS),
        Option.flatMap((match) => Array.get(match, 1)),
        Option.getOrElse(() => '')
      )
  const end = pipe(host, String.slice(lead.length))
  return `${lead === '' ? '' : `<span class="host-lead">${escapeHtml(lead)}</span>`}<strong>${escapeHtml(end)}</strong>`
}

const DEVICE_HEADLINE = 'An app on this device wants to access your plants'
const DEVICE_HANDOFF = 'Lily will hand the connection to that app'

const describeDestination = Destination.$match({
  Website: ({ host }) => ({
    headline: `${renderHost(host)} wants to access your plants`,
    detail: Option.none<string>(),
    handoff: 'Lily will send you on to that website',
  }),
  Loopback: ({ address }) => ({
    headline: DEVICE_HEADLINE,
    detail: Option.some(
      `It is waiting at <strong>${escapeHtml(address)}</strong>.`
    ),
    handoff: DEVICE_HANDOFF,
  }),
  AppScheme: ({ scheme }) => ({
    headline: DEVICE_HEADLINE,
    detail: Option.some(
      `It opens <strong>${escapeHtml(scheme)}://</strong> links.`
    ),
    handoff: DEVICE_HANDOFF,
  }),
})

// Registration stores any client_name, so it is cleaned where it is shown
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu
const MAX_NAME_LENGTH = 60

const displayName = (name: string) => {
  const visible = pipe(
    name,
    String.replace(INVISIBLE, ''),
    String.replace(/\s+/g, ' '),
    String.trim
  )
  const codePoints = Array.fromIterable(visible)
  const shown =
    codePoints.length > MAX_NAME_LENGTH
      ? `${Array.join(Array.take(codePoints, MAX_NAME_LENGTH), '')}…`
      : visible
  return Option.liftPredicate(shown, String.isNonEmpty)
}

/**
 * Renders the consent/login page for MCP OAuth flow.
 *
 * When a user connects an MCP client (e.g. Claude Desktop), the OAuth server
 * redirects here. The page validates the authorization request, then names
 * where the authorization will be sent and shows the client's self-declared
 * name as unverified, since registration is open to anyone. Query params from
 * the OAuth flow are forwarded to the confirm endpoint, which validates them
 * again.
 */
export const consentHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const serverUrl = yield* McpServerUrl
  const url = new URL(request.url, serverUrl)
  const qs = url.searchParams

  const { client, request: authorization } =
    yield* parseAuthorizationRequest(qs)
  const { headline, detail, handoff } = describeDestination(
    toDestination(authorization.redirectUri)
  )
  const claimedName = pipe(
    Option.fromNullishOr(client.client_name),
    Option.flatMap(displayName),
    Option.match({
      onNone: () => '<p class="subtitle">This app gave no name.</p>',
      onSome: (name) =>
        `<p class="subtitle">This app calls itself “<bdi>${escapeHtml(name)}</bdi>”.</p>
    <p class="unverified">Lily has not verified that name.</p>`,
    })
  )

  return HttpServerResponse.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect to Lily</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      overflow-wrap: anywhere;
    }
    .logo { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.25rem; }
    .host-lead { font-weight: 400; color: #777; }
    .detail { font-size: 0.9rem; margin-bottom: 0.5rem; }
    .subtitle { color: #666; font-size: 0.9rem; }
    .subtitle bdi { color: #333; font-weight: 600; }
    .unverified { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    label { display: block; font-weight: 500; font-size: 0.875rem; margin-bottom: 0.5rem; }
    input[type="email"] {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
      margin-bottom: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="email"]:focus { border-color: #4CAF50; }
    button {
      width: 100%;
      padding: 0.75rem;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #43A047; }
    .info {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #f0f7f0;
      border-radius: 8px;
      font-size: 0.8rem;
      color: #555;
    }
    #sent-message {
      display: none;
      text-align: center;
      padding: 1.5rem 0;
    }
    #sent-message .check { font-size: 3rem; margin-bottom: 0.5rem; }
    #sent-message p { color: #444; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">&#127793;</div>
    <h1>${headline}</h1>
    ${Option.match(detail, { onNone: () => '', onSome: (line) => `<p class="detail">${line}</p>` })}
    ${claimedName}

    <form id="login-form" action="/confirm?${escapeHtml(qs.toString())}" method="POST">
      <label for="email">Email address</label>
      <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email">
      <button type="submit">Send magic link</button>
    </form>

    <div id="sent-message">
      <div class="check">&#9989;</div>
      <p>Check your email for a magic link.<br>Click it to complete the connection.</p>
    </div>

    <div class="info">
      A magic link will be sent to your email. Click it to connect, and ${handoff}.
    </div>
  </div>

  <script>
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const form = e.target
      const button = form.querySelector('button')
      button.disabled = true
      button.textContent = 'Sending...'

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)),
        })

        if (res.ok) {
          form.style.display = 'none'
          document.getElementById('sent-message').style.display = 'block'
        } else {
          const data = await res.json().catch(() => ({}))
          alert(data.error || 'Something went wrong. Please try again.')
          button.disabled = false
          button.textContent = 'Send magic link'
        }
      } catch {
        alert('Network error. Please try again.')
        button.disabled = false
        button.textContent = 'Send magic link'
      }
    })
  </script>
</body>
</html>`)
}).pipe(
  Effect.catchTags({
    OAuthError: (err) =>
      Effect.succeed(
        errorPage('Cannot connect to Lily', err.error_description)
      ),
    SqlError: () =>
      Effect.succeed(
        errorPage('Cannot connect to Lily', 'Something went wrong.', 500)
      ),
  }),
  Effect.withSpan('MCP.consent')
)
