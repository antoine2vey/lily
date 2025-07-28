import { Database } from '@lily/db'
import { Effect } from 'effect'

// Sign out
export const signOut = () =>
  Effect.gen(function* () {
    const _db = yield* Database

    // Return fake success message
    return { message: 'Successfully signed out' }
  })
