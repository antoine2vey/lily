import { HttpServerRequest } from '@effect/platform'
import { Auth } from '@lily/api/services/auth/auth'
import {
  type VerifyEmailRequest,
  VerifyEmailRequestZod,
} from '@lily/shared/auth'
import { Effect } from 'effect'

export const verifyEmail = ({
  token,
}: VerifyEmailRequest): Effect.Effect<
  {
    user: {
      id: string
      email: string
      name: string
      createdAt: Date
      updatedAt: Date
    }
    verified: boolean
  },
  { error: string },
  Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    // Validate token using Zod
    const validation = VerifyEmailRequestZod.safeParse({ token })
    if (!validation.success) {
      const message = validation.error.issues[0]?.message ?? 'Invalid token'
      return yield* Effect.fail({ error: message })
    }

    const auth = yield* Auth
    const authClient = yield* auth.client
    const req = yield* HttpServerRequest.HttpServerRequest

    const result = yield* Effect.tryPromise({
      try: () =>
        authClient.api.verifyEmail({
          query: { token },
          headers: req.headers,
        }),
      catch: () => ({ error: 'Invalid or expired verification token' }),
    })

    if (!result || !('user' in result) || !result.user) {
      return yield* Effect.fail({
        error: 'Invalid or expired verification token',
      })
    }

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        createdAt: result.user.createdAt,
        updatedAt: result.user.updatedAt,
      },
      verified: true,
    }
  })
