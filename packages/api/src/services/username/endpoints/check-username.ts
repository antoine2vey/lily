import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { UsernameAvailability } from '@lily/shared/username'
import { Effect } from 'effect'

// Check username availability
export const checkUsername = (
  username: string
): Effect.Effect<UsernameAvailability, SqlError, UserRepository> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const user = yield* repo.findByUsername(username)

    return {
      username,
      available: user === null,
    }
  }).pipe(
    Effect.withSpan('UsernameService.checkUsername', {
      attributes: { 'username.value': username },
    })
  )
