import { ApiClient } from '@lily/mcp/api-client'
import { OAuthRepository } from '@lily/mcp/auth/oauth-repository'
import { OAuthError, OAuthService } from '@lily/mcp/auth/oauth-service'
import {
  cookieOptions,
  open,
  PENDING_COOKIE,
  PendingSecret,
} from '@lily/mcp/auth/pending-authorization'
import { McpServerUrl } from '@lily/mcp/config'
import { DateTime, Effect, Option } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'

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

const SAME_BROWSER_MESSAGE =
  'This link must be opened in the same browser where you started connecting. Go back to that browser and request a new link.'

/**
 * Handles GET /verify — magic link callback.
 *
 * The emailed link carries only the pending authorization id and the magic
 * link code. The OAuth request itself comes from the signed cookie set by
 * POST /confirm, so the link completes only in the browser that asked for it.
 *
 * Flow:
 * 1. Matches the cookie against the pending id in the URL
 * 2. Calls ApiClient.issueServiceToken({ magicLinkCode }) to validate the
 *    magic link and obtain an API JWT + user profile
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
  const pendingId = params.get('pending')
  if (!code || !pendingId) {
    return errorHtml('Missing verification code')
  }

  const secret = yield* PendingSecret
  const nowMs = DateTime.toEpochMillis(DateTime.nowUnsafe())
  const pending = Option.fromNullishOr(request.cookies[PENDING_COOKIE]).pipe(
    Option.flatMap((sealed) => open(secret, sealed, nowMs)),
    Option.filter((pending) => pending.id === pendingId)
  )
  if (Option.isNone(pending)) {
    return errorHtml(SAME_BROWSER_MESSAGE)
  }
  const { clientId, redirectUri, codeChallenge, scopes, state, resource } =
    pending.value

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

  const redirectUrl = new URL(redirectUri)
  redirectUrl.searchParams.set('code', authCode)
  if (state) {
    redirectUrl.searchParams.set('state', state)
  }

  return HttpServerResponse.redirect(redirectUrl.toString(), {
    status: 302,
  }).pipe(
    HttpServerResponse.expireCookieUnsafe(
      PENDING_COOKIE,
      cookieOptions(serverUrl)
    )
  )
}).pipe(
  Effect.catchTag('OAuthError', (err) =>
    Effect.succeed(errorHtml(err.error_description))
  ),
  Effect.catchTag('SqlError', () =>
    Effect.succeed(errorHtml('Authentication failed'))
  ),
  Effect.withSpan('MCP.verify')
)
