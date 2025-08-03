import { HttpServerRequest } from '@effect/platform'
import { PrismaService } from '@lily/db'
import { Auth } from '@lily/db/lib/auth'
import type { MagicLinkVerifyRequest, UserProfile } from '@lily/shared/auth'
import { Effect } from 'effect'

// Verify magic link
export const verifyMagicLink = ({
  token,
}: MagicLinkVerifyRequest): Effect.Effect<
  { token: string; user: UserProfile },
  { message: string },
  PrismaService | Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService
    const auth = yield* Auth
    const req = yield* HttpServerRequest.HttpServerRequest

    yield* Effect.log(token)
    yield* Effect.log(req.headers)

    const response = yield* Effect.tryPromise({
      try: () =>
        auth.api.magicLinkVerify({
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
