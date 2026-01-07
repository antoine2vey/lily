import type { HttpServerRequest } from '@effect/platform'
import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Auth } from '@lily/db/lib/auth'
import type { UsernameRequest, UserProfile } from '@lily/shared/auth'
import {
  SessionNotFoundError,
  UserNotFoundError,
} from '@lily/shared/errors/user'
import { Effect } from 'effect'

// Set username
export const setUsername = (
  request: UsernameRequest
): Effect.Effect<
  UserProfile,
  SqlError | SessionNotFoundError | UserNotFoundError,
  UserRepository | Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const auth = yield* Auth
    const session = yield* auth.session

    if (!session) {
      return yield* Effect.fail(
        new SessionNotFoundError({
          message: 'No session found',
        })
      )
    }

    const user = yield* repo.update(session.user.id, { name: request.username })

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })
