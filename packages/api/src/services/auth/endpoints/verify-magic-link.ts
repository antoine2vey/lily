import { HttpServerRequest } from '@effect/platform'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Auth } from '@lily/api/services/auth/auth'
import type { MagicLinkVerifyRequest, UserProfile } from '@lily/shared/auth'
import { Effect } from 'effect'

const CALLBACK_URL =
  process.env.AUTH_CALLBACK_URL ?? 'http://localhost:3000/dashboard'
const ERROR_CALLBACK_URL =
  process.env.AUTH_ERROR_CALLBACK_URL ?? 'http://localhost:3000/error'

export const verifyMagicLink = ({
  token,
}: MagicLinkVerifyRequest): Effect.Effect<
  { token: string; user: UserProfile },
  { message: string },
  Auth | HttpServerRequest.HttpServerRequest | UserRepository
> =>
  Effect.gen(function* () {
    const auth = yield* Auth
    const authClient = yield* auth.client
    const req = yield* HttpServerRequest.HttpServerRequest

    const response = yield* Effect.tryPromise({
      try: () =>
        authClient.api.magicLinkVerify({
          query: {
            token,
            callbackURL: CALLBACK_URL,
            errorCallbackURL: ERROR_CALLBACK_URL,
          },
          headers: req.headers,
        }),
      catch: () => ({ message: 'Failed to verify magic link' }),
    })

    // Fetch full user from database to get role and status
    const userRepo = yield* UserRepository
    const user = yield* Effect.catchAll(
      userRepo.findById(response.user.id),
      () => Effect.fail({ message: 'User not found' })
    )

    if (!user) {
      return yield* Effect.fail({ message: 'User not found' })
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
      token: response.token,
      user: userProfile,
    }
  })
