import { HttpServerRequest } from '@effect/platform'
import { Auth } from '@lily/api/services/auth/auth'
import { Effect } from 'effect'

/**
 * Refresh access token using the current session
 * Returns a new JWT access token if the session is valid
 */
export const refreshToken = (): Effect.Effect<
  { accessToken: string },
  { error: string },
  Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const auth = yield* Auth
    const authClient = yield* auth.client
    const req = yield* HttpServerRequest.HttpServerRequest

    // Get current session from cookies/headers
    const session = yield* Effect.tryPromise({
      try: () =>
        authClient.api.getSession({
          headers: new Headers(req.headers),
          query: { disableCookieCache: true },
        }),
      catch: () => ({ error: 'Invalid or expired session' }),
    })

    if (!session?.user) {
      return yield* Effect.fail({ error: 'Invalid or expired session' })
    }

    // Get a new JWT token by calling getSession which returns JWT in header
    // The JWT plugin adds the token to the response
    const tokenResponse = yield* Effect.tryPromise({
      try: () =>
        authClient.api.getSession({
          headers: new Headers(req.headers),
          query: { disableCookieCache: true },
        }),
      catch: () => ({ error: 'Failed to generate access token' }),
    })

    // The JWT is returned in the session token field when JWT plugin is enabled
    if (!tokenResponse?.session?.token) {
      return yield* Effect.fail({ error: 'Failed to generate access token' })
    }

    return { accessToken: tokenResponse.session.token }
  })
