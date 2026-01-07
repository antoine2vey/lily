import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { User } from '@lily/shared'
import { Effect } from 'effect'

export const findUsers = (): Effect.Effect<User[], SqlError, UserRepository> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    return yield* repo.findAll()
  })
