import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { User } from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

export const deleteUser = (
  id: string
): Effect.Effect<User, SqlError | UserNotFoundError, UserRepository> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const user = yield* repo.delete(id)

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })
