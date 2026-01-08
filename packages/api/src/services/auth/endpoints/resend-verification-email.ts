import { HttpServerRequest } from '@effect/platform'
import { Auth } from '@lily/api/services/auth/auth'
import {
  type ResendVerificationRequest,
  ResendVerificationRequestZod,
} from '@lily/shared/auth'
import { Effect } from 'effect'

export const resendVerificationEmail = ({
  email,
}: ResendVerificationRequest): Effect.Effect<
  { message: string },
  { error: string },
  Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    // Validate email format using Zod
    const validation = ResendVerificationRequestZod.safeParse({ email })
    if (!validation.success) {
      const message =
        validation.error.issues[0]?.message ?? 'Invalid email format'
      return yield* Effect.fail({ error: message })
    }

    const auth = yield* Auth
    const authClient = yield* auth.client
    const req = yield* HttpServerRequest.HttpServerRequest

    yield* Effect.tryPromise({
      try: () =>
        authClient.api.sendVerificationEmail({
          body: { email },
          headers: req.headers,
        }),
      catch: () => ({ error: 'Failed to send verification email' }),
    })

    return { message: 'Verification email sent' }
  })
