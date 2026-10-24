import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  type UsernameAvailability,
  usernameProblem,
} from '@lily/shared/username'
import { Effect, Option, String } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// Check username availability
export const checkUsername = (
  username: string
): Effect.Effect<UsernameAvailability, SqlError, UserRepository> =>
  Effect.gen(function* () {
    if (Option.isSome(usernameProblem(String.trim(username)))) {
      return { username, available: false }
    }

    const repo = yield* UserRepository
    const user = yield* repo.findByUsername(String.trim(username))

    return {
      username,
      available: user === null,
    }
  }).pipe(
    Effect.withSpan('UsernameService.checkUsername', {
      attributes: { 'username.value': username },
    })
  )
