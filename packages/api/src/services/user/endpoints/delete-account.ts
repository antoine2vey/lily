import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { releaseAccount } from '@lily/api/services/user/helpers/release-account'
import { UserNotFoundError } from '@lily/shared'
import { Effect, Option, pipe } from 'effect'

export const deleteAccount = Effect.fn('UserService.deleteAccount')(
  function* () {
    const user = yield* CurrentUser

    const released = yield* releaseAccount(user.id)

    yield* pipe(
      Option.fromNullishOr(released),
      Option.match({
        onNone: () => Effect.fail(new UserNotFoundError()),
        onSome: () => Effect.void,
      })
    )

    return { message: 'Account scheduled for deletion' }
  }
)
