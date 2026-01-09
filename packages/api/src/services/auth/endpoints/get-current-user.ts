import type { HttpServerRequest } from '@effect/platform'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Auth } from '@lily/api/services/auth/auth'
import type { UserProfile } from '@lily/shared/auth'
import { SessionNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

export const getCurrentUser = (): Effect.Effect<
  UserProfile,
  SessionNotFoundError,
  Auth | HttpServerRequest.HttpServerRequest | UserRepository
> =>
  Effect.gen(function* () {
    const auth = yield* Auth
    const session = yield* auth.session

    if (!session) {
      return yield* Effect.fail(
        new SessionNotFoundError({
          message: 'No session found',
        })
      )
    }

    // Fetch full user from database to get role and status
    const userRepo = yield* UserRepository
    const user = yield* Effect.catchAll(userRepo.findById(session.user.id), () =>
      Effect.fail(
        new SessionNotFoundError({
          message: 'User not found',
        })
      )
    )

    if (!user) {
      return yield* Effect.fail(
        new SessionNotFoundError({
          message: 'User not found',
        })
      )
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role,
      status: user.status,
    } as UserProfile
  })
