import { HttpServerRequest, HttpServerResponse } from '@effect/platform'
import { ApiClient } from '@lily/mcp/api-client'
import { OAuthRepository } from '@lily/mcp/auth/oauth-repository'
import { OAuthError, OAuthService } from '@lily/mcp/auth/oauth-service'
import { McpServerUrl } from '@lily/mcp/config'
import { Array, Effect, String as EffectString, Option, pipe } from 'effect'

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const errorHtml = (message: string) =>
  HttpServerResponse.text(
    `<html><body style="font-family:sans-serif;padding:2rem;text-align:center">
      <h2>Authentication failed</h2>
      <p>${escapeHtml(message)}</p>
      <p>Please close this window and try again.</p>
    </body></html>`,
    {
      status: 400,
      contentType: 'text/html',
    }
  )

/**
 * Handles GET /verify — magic link callback.
 *
 * Called when the user clicks the magic link in their email.
 * The code in the URL is a magic link token created by the API server.
 *
 * Flow:
 * 1. Calls ApiClient.issueServiceToken({ magicLinkCode }) to validate the
 *    magic link and obtain an API JWT + user profile
 * 2. Validates OAuth params (client_id, redirect_uri, code_challenge)
 * 3. Upserts API credentials into oauth_user_api_credentials
 * 4. Creates an OAuth authorization code
 * 5. Redirects back to the MCP client with the auth code
 */
export const verifyHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const apiClient = yield* ApiClient
  const oauthService = yield* OAuthService
  const repo = yield* OAuthRepository

  const serverUrl = yield* McpServerUrl
  const url = new URL(request.url, serverUrl)
  const params = url.searchParams

  const code = params.get('code')
  if (!code) {
    return errorHtml('Missing verification code')
  }

  // Validate magic link and get API JWT via the API server.
  const authResponse = yield* apiClient
    .issueServiceToken({ magicLinkCode: code })
    .pipe(
      Effect.catchTag('ExternalServiceError', (err) =>
        Effect.fail(
          new OAuthError({
            error: 'invalid_code',
            error_description:
              err.statusCode === 401 || err.statusCode === 404
                ? 'Invalid or expired code'
                : err.statusCode != null
                  ? `API error (${err.statusCode})`
                  : 'Service unavailable — please try again',
          })
        )
      )
    )

  // Validate required OAuth params before storing credentials
  const clientId = params.get('client_id')
  if (!clientId) {
    return errorHtml('Missing client_id')
  }

  const maybeClient = yield* oauthService.getClient(clientId)
  if (Option.isNone(maybeClient)) {
    return errorHtml('Unknown client')
  }
  const client = maybeClient.value

  const redirectUri = params.get('redirect_uri')
  const codeChallenge = params.get('code_challenge')
  if (!redirectUri || !codeChallenge) {
    return errorHtml('Missing redirect_uri or code_challenge')
  }

  // Validate redirect_uri against registered URIs (RFC 6749 §10.6)
  if (
    !Array.some(client.redirect_uris as string[], (uri) => uri === redirectUri)
  ) {
    return errorHtml('redirect_uri does not match registered URIs')
  }

  // Validate code_challenge_method — only S256 is supported
  const codeChallengeMethod = pipe(
    Option.fromNullable(params.get('code_challenge_method')),
    Option.getOrElse(() => 'S256')
  )
  if (codeChallengeMethod !== 'S256') {
    return errorHtml('Only S256 code_challenge_method is supported')
  }

  const scopes = pipe(
    Option.fromNullable(params.get('scope')),
    Option.map((s) => EffectString.split(s, ' ')),
    Option.map(Array.fromIterable),
    Option.getOrElse(() => [] as string[])
  )
  const state = Option.getOrUndefined(Option.fromNullable(params.get('state')))
  const resource = Option.getOrUndefined(
    Option.fromNullable(params.get('resource'))
  )

  // Store API credentials and create authorization code in parallel
  // (independent DB writes — no ordering dependency)
  const [, authCode] = yield* Effect.all(
    [
      repo.upsertUserApiCredentials({
        userId: authResponse.user.id,
        apiJwt: authResponse.accessToken,
        apiRefreshToken: authResponse.refreshToken,
      }),
      oauthService.createAuthorizationCode({
        clientId,
        userId: authResponse.user.id,
        redirectUri,
        codeChallenge,
        scopes,
        ...(state != null ? { state } : {}),
        ...(resource != null ? { resource } : {}),
      }),
    ],
    { concurrency: 'unbounded' }
  )

  // Redirect back to client with auth code
  const redirectUrl = new URL(redirectUri)
  redirectUrl.searchParams.set('code', authCode)
  if (state) {
    redirectUrl.searchParams.set('state', state)
  }

  return HttpServerResponse.redirect(redirectUrl.toString(), {
    status: 302,
  })
}).pipe(
  Effect.catchTag('OAuthError', (err) =>
    Effect.succeed(errorHtml(err.error_description))
  ),
  Effect.catchTag('SqlError', () =>
    Effect.succeed(errorHtml('Authentication failed'))
  ),
  Effect.withSpan('MCP.verify')
)
