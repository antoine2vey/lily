import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { DatabaseError } from '@lily/shared/errors/database'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'

export const createUser = (
  name: string,
  email: string
): Effect.Effect<User, SqlError | DatabaseError, UserRepository> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const user = yield* repo.create({ name, email })

    if (!user) {
      return yield* Effect.fail(new DatabaseError())
    }

    return user
  })
