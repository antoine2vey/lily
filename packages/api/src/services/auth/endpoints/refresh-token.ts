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

    if (!session.session?.token) {
      return yield* Effect.fail({ error: 'Failed to generate access token' })
    }

    return { accessToken: session.session.token }
  })
