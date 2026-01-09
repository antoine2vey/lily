import { HttpServerRequest } from '@effect/platform'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Auth } from '@lily/api/services/auth/auth'
import {
  type UserProfile,
  type VerifyEmailRequest,
  VerifyEmailRequestZod,
} from '@lily/shared/auth'
import { Effect } from 'effect'

export const verifyEmail = ({
  token,
}: VerifyEmailRequest): Effect.Effect<
  {
    user: UserProfile
    verified: boolean
  },
  { error: string },
  Auth | HttpServerRequest.HttpServerRequest | UserRepository
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

    // Fetch full user from database to get role and status
    const userRepo = yield* UserRepository
    const user = yield* Effect.catchAll(
      userRepo.findById(result.user.id),
      () => Effect.fail({ error: 'User not found' })
    )

    if (!user) {
      return yield* Effect.fail({ error: 'User not found' })
    }

    const userProfile: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role,
      status: user.status,
    }

    return {
      user: userProfile,
      verified: true,
    }
  })
