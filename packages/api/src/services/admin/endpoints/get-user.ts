import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'

export const getUser = (
  id: string
): Effect.Effect<User, SqlError | UserNotFoundError, UserRepository> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const user = yield* repo.findById(id)

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })
