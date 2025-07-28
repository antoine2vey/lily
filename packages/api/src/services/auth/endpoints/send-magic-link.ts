import type { HttpServerRequest } from '@effect/platform/HttpServerRequest'
import { PrismaService } from '@lily/db'
import { Auth } from '@lily/db/lib/auth'
import type { MagicLinkRequest } from '@lily/shared/auth'
import { Effect } from 'effect'

// Send magic link
export const sendMagicLink = (
  req: HttpServerRequest,
  { email }: MagicLinkRequest
): Effect.Effect<
  { message: string },
  { message: string },
  PrismaService | Auth
> =>
  Effect.gen(function* () {
    const auth = yield* Auth
    const prisma = yield* PrismaService

    const magicLinkResponse = yield* Effect.tryPromise({
      try: () =>
        auth.api.signInMagicLink({
          body: {
            email, // Use actual email from request
            name: 'User', // Could be derived from email or made optional
            callbackURL: 'http://localhost:3000/dashboard',
            newUserCallbackURL: 'http://localhost:3000/welcome',
            errorCallbackURL: 'http://localhost:3000/error',
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
