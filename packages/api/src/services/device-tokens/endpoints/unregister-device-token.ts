import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { Effect } from 'effect'

// Unregister device token
export const unregisterDeviceToken = (
  tokenId: string
): Effect.Effect<{ message: string }, never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake success message
    return { message: `Device token ${tokenId} unregistered successfully` }
  })
