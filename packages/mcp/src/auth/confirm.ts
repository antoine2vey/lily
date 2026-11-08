import { ApiClient } from '@lily/mcp/api-client'
import { parseAuthorizationRequest } from '@lily/mcp/auth/authorization-request'
import {
  cookieOptions,
  PENDING_COOKIE,
  PENDING_TTL,
  type PendingAuthorization,
  PendingSecret,
  seal,
} from '@lily/mcp/auth/pending-authorization'
import { McpServerUrl } from '@lily/mcp/config'
import { Console, DateTime, Effect } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'

/**
 * Handles POST /confirm — email submission for magic link auth.
 *
 * Validates the OAuth request, then delegates magic link creation and
 * email sending to the API server via ApiClient.sendMagicLink(). The
 * validated request travels in a signed cookie bound to this browser,
 * not in the emailed link.
 */
export const confirmHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const apiClient = yield* ApiClient
  const body = yield* request.text
  const form = new URLSearchParams(body)
  const serverUrl = yield* McpServerUrl
  const url = new URL(request.url, serverUrl)

  const email = form.get('email')
  if (!email) {
    return yield* HttpServerResponse.json(
      { error: 'Email is required' },
      { status: 400 }
    )
  }

  const authorization = yield* parseAuthorizationRequest(url.searchParams)
  const secret = yield* PendingSecret
  const pending: PendingAuthorization = {
    ...authorization,
    id: crypto.randomUUID(),
    expiresAt: DateTime.toEpochMillis(
      DateTime.addDuration(DateTime.nowUnsafe(), PENDING_TTL)
    ),
  }

  const callbackUrl = new URL(`${serverUrl}/verify`)
  callbackUrl.searchParams.set('pending', pending.id)

  if (process.env.NODE_ENV === 'development') {
    yield* Console.log(`\n${'='.repeat(50)}`)
    yield* Console.log('Callback URL (code will be appended by API):')
    yield* Console.log(callbackUrl.toString())
    yield* Console.log(`${'='.repeat(50)}\n`)
  }

  yield* apiClient.sendMagicLink({
    email,
    callbackUrl: callbackUrl.toString(),
  })

  const response = yield* HttpServerResponse.json({
    message: 'Magic link sent',
  })
  return response.pipe(
    HttpServerResponse.setCookieUnsafe(PENDING_COOKIE, seal(secret, pending), {
      ...cookieOptions(serverUrl),
      maxAge: PENDING_TTL,
    })
  )
}).pipe(
  Effect.catchTag('OAuthError', (err) =>
    HttpServerResponse.json({ error: err.error_description }, { status: 400 })
  ),
  Effect.catchTag('SqlError', () =>
    HttpServerResponse.json(
      { error: 'Request failed. Please try again.' },
      { status: 500 }
    )
  ),
  Effect.catchTag('ExternalServiceError', (err) =>
    Effect.flatMap(
      Effect.logError('POST /confirm failed', { error: err.message }),
      () =>
        HttpServerResponse.json(
          { error: 'Request failed. Please try again.' },
          { status: 500 }
        )
    )
  ),
  Effect.withSpan('MCP.confirm')
)
