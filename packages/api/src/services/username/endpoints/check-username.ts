import { Database } from '@lily/db'
import type { UsernameAvailability } from '@lily/shared/username'
import { Effect } from 'effect'

// Check username availability
export const checkUsername = (username: string) =>
  Effect.gen(function* () {
    const _db = yield* Database

    // Return fake availability check
    return {
      username,
      available: username !== 'admin' && username !== 'root', // Fake logic
    } satisfies UsernameAvailability
  })
