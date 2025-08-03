import { HttpServerRequest } from '@effect/platform'
import { PrismaService } from '@lily/db'
import { Auth } from '@lily/db/lib/auth'
import type { MagicLinkRequest } from '@lily/shared/auth'
import { Effect } from 'effect'

// Send magic link
export const sendMagicLink = ({
  email,
}: MagicLinkRequest): Effect.Effect<
  { message: string },
  { message: string },
  PrismaService | Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const auth = yield* Auth
    const prisma = yield* PrismaService
    const req = yield* HttpServerRequest.HttpServerRequest

    const magicLinkResponse = yield* Effect.tryPromise({
      try: () =>
        auth.api.signInMagicLink({
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
