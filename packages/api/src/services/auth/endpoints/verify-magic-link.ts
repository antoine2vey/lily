import { HttpServerRequest } from '@effect/platform'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { Auth } from '@lily/api/services/auth/auth'
import type { MagicLinkVerifyRequest, UserProfile } from '@lily/shared/auth'
import { Effect } from 'effect'

// Verify magic link
export const verifyMagicLink = ({
  token,
}: MagicLinkVerifyRequest): Effect.Effect<
  { token: string; user: UserProfile },
  { message: string },
  PgDrizzle.PgDrizzle | Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle
    const auth = yield* Auth
    const authClient = yield* auth.client
    const req = yield* HttpServerRequest.HttpServerRequest

    yield* Effect.log(token)
    yield* Effect.log(req.headers)

    const response = yield* Effect.tryPromise({
      try: () =>
        authClient.api.magicLinkVerify({
          query: {
            token,
            callbackURL: 'http://localhost:3000/dashboard',
            errorCallbackURL: 'http://localhost:3000/error',
          },
          headers: req.headers,
        }),
      catch: (error) => {
        console.log(error)
        return { message: 'Failed to verify magic link' }
      },
    })

    yield* Effect.log(response)

    return response
  })
