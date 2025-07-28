import type { HttpServerRequest } from '@effect/platform/HttpServerRequest'
import { PrismaService } from '@lily/db'
import { Auth } from '@lily/db/lib/auth'
import type { MagicLinkVerifyRequest, UserProfile } from '@lily/shared/auth'
import { Effect } from 'effect'

// Verify magic link
export const verifyMagicLink = (
  req: HttpServerRequest,
  { token }: MagicLinkVerifyRequest
): Effect.Effect<
  { token: string; user: UserProfile },
  { message: string },
  PrismaService | Auth
> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService
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
