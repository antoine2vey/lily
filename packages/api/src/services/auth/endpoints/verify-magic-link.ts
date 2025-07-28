import type { HttpServerRequest } from '@effect/platform/HttpServerRequest'
import { Database } from '@lily/db'
import { Auth } from '@lily/db/lib/auth'
import type { MagicLinkVerifyRequest } from '@lily/shared/auth'
import { Effect } from 'effect'

// Verify magic link
export const verifyMagicLink = (
  req: HttpServerRequest,
  { token }: MagicLinkVerifyRequest
) =>
  Effect.gen(function* () {
    const _db = yield* Database
    const auth = yield* Auth

    return yield* Effect.tryPromise({
      try: () =>
        auth.api.magicLinkVerify({
          query: {
            token,
            callbackURL: 'http://localhost:3000/dashboard',
          },
          headers: req.headers,
        }),
      catch: (error) => {
        console.error(error)
        return { message: 'Failed to verify magic link' }
      },
    })
  })
