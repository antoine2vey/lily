import { HttpServerRequest, HttpServerResponse } from '@effect/platform'
import { OAuthService } from '@lily/mcp/auth/oauth-service'
import { McpServerUrl } from '@lily/mcp/config'
import { Effect, Option, pipe } from 'effect'

/**
 * Renders the consent/login page for MCP OAuth flow.
 *
 * When a user connects an MCP client (e.g. Claude Desktop), the OAuth server
 * redirects here. The page shows the requesting app's name and an email input
 * for magic link authentication. Query params from the OAuth flow are forwarded
 * to the confirm endpoint.
 *
 * The client_name is resolved from the database (not from the query string)
 * to prevent identity spoofing via URL manipulation.
 */
export const consentHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const oauthService = yield* OAuthService
  const serverUrl = yield* McpServerUrl
  const url = new URL(request.url, serverUrl)
  const qs = url.searchParams

  // Resolve client_name from DB to prevent identity spoofing
  const clientName = yield* pipe(
    Option.fromNullable(qs.get('client_id')),
    Option.match({
      onNone: () => Effect.succeed('MCP Client'),
      onSome: (id) =>
        Effect.map(oauthService.getClient(id), (opt) =>
          pipe(
            opt,
            Option.flatMap((c) => Option.fromNullable(c.client_name)),
            Option.getOrElse(() => 'MCP Client')
          )
        ),
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
    }
    .logo { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
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
    <h1>Connect to Lily</h1>
    <p class="subtitle">Allow <strong>${escapeHtml(clientName)}</strong> to access your plants</p>

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
      A magic link will be sent to your email. Click it to authorize ${escapeHtml(clientName)} to manage your plants.
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
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
