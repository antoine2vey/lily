import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { Effect } from 'effect'

// Sign out
export const signOut = (): Effect.Effect<
  { message: string },
  never,
  PgDrizzle.PgDrizzle
> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake success message
    return { message: 'Successfully signed out' }
  })
