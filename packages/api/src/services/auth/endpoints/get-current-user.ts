import type { HttpServerRequest } from '@effect/platform'
import { Auth } from '@lily/db/lib/auth'
import type { UserProfile } from '@lily/shared/auth'
import { SessionNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

export const getCurrentUser = (): Effect.Effect<
  UserProfile,
  SessionNotFoundError,
  Auth | HttpServerRequest.HttpServerRequest
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

    return session.user
  })
