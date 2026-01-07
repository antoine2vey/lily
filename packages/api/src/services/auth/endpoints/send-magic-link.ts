import { HttpServerRequest } from '@effect/platform'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { Auth } from '@lily/db/lib/auth'
import type { MagicLinkRequest } from '@lily/shared/auth'
import { Effect } from 'effect'

// Send magic link
export const sendMagicLink = ({
  email,
}: MagicLinkRequest): Effect.Effect<
  { message: string },
  { message: string },
  PgDrizzle.PgDrizzle | Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const auth = yield* Auth
    const authClient = yield* auth.client
    const _db = yield* PgDrizzle.PgDrizzle
    const req = yield* HttpServerRequest.HttpServerRequest

    const _magicLinkResponse = yield* Effect.tryPromise({
      try: () =>
        authClient.api.signInMagicLink({
          body: {
            email, // Use actual email from request
            callbackURL: 'http://localhost:3000/dashboard',
          },
          headers: req.headers,
        }),
      catch: (error) => {
        console.error(error)
        return { message: 'Failed to send magic link' }
      },
    })

    return { message: `Magic link sent to ${email}` }
  })
