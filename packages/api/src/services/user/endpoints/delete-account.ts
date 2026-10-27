import { RefreshTokenRepository } from '@lily/api/repositories/refresh-token.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { leaveCanopy } from '@lily/api/services/canopy/helpers/leave-canopy'
import { UserNotFoundError } from '@lily/shared'
import { Effect, Option, pipe } from 'effect'

export const deleteAccount = Effect.fn('UserService.deleteAccount')(
  function* () {
    const user = yield* CurrentUser
    const userRepo = yield* UserRepository
    const refreshTokenRepo = yield* RefreshTokenRepository

    // The request ends Canopy membership now, not at the hard delete.
    yield* leaveCanopy(user.id)

    // Soft-delete user and revoke tokens in parallel
    const [deleted] = yield* Effect.all(
      [
        userRepo.softDelete(user.id),
        refreshTokenRepo.revokeAllForUser(user.id),
      ],
      { concurrency: 'unbounded' }
    )

    yield* pipe(
      Option.fromNullishOr(deleted),
      Option.match({
        onNone: () => Effect.fail(new UserNotFoundError()),
        onSome: () => Effect.void,
      })
    )

    return { message: 'Account scheduled for deletion' }
  }
)
