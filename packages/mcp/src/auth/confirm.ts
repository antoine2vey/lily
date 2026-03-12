import { HttpServerRequest, HttpServerResponse } from '@effect/platform'
import { ApiClient } from '@lily/mcp/api-client'
import { MCP_SERVER_URL } from '@lily/mcp/config'
import { Cause, Console, Effect } from 'effect'

/**
 * Handles POST /confirm — email submission for magic link auth.
 *
 * Delegates magic link creation and email sending to the API server
 * via ApiClient.sendMagicLink(), keeping the MCP server stateless
 * with respect to magic links.
 */
export const confirmHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const apiClient = yield* ApiClient
  const body = yield* request.text
  const form = new URLSearchParams(body)
  const url = new URL(request.url, MCP_SERVER_URL)
  const oauthParams = url.searchParams

  const email = form.get('email')
  if (!email) {
    return yield* HttpServerResponse.json(
      { error: 'Email is required' },
      { status: 400 }
    )
  }

  // Build callback URL pointing back to MCP's /verify with OAuth params
  const callbackUrl = new URL(`${MCP_SERVER_URL}/verify`)
  for (const [key, value] of oauthParams.entries()) {
    callbackUrl.searchParams.set(key, value)
  }

  if (process.env.NODE_ENV === 'development') {
    yield* Console.log(`\n${'='.repeat(50)}`)
    yield* Console.log('Callback URL (code will be appended by API):')
    yield* Console.log(callbackUrl.toString())
    yield* Console.log(`${'='.repeat(50)}\n`)
  }

  // Delegate to API server — it handles rate limiting, token creation, and email
  yield* apiClient.sendMagicLink({
    email,
    callbackUrl: callbackUrl.toString(),
  })

  return yield* HttpServerResponse.json({ message: 'Magic link sent' })
}).pipe(
  Effect.catchAllCause((cause) =>
    Effect.flatMap(
      Effect.log(`POST /confirm failed: ${Cause.pretty(cause)}`),
      () =>
        HttpServerResponse.json(
          { error: 'Request failed. Please try again.' },
          { status: 500 }
        )
    )
  ),
  Effect.withSpan('MCP.confirm')
)
