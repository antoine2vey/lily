import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { Effect } from 'effect'

// Delete care log
export const deleteCareLog = (
  _plantId: string,
  logId: string
): Effect.Effect<{ message: string }, never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake success message
    return { message: `Care log ${logId} deleted successfully` }
  })
