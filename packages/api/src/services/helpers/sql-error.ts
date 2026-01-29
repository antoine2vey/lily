/**
 * SqlError handling utilities
 *
 * SqlError from @effect/sql is converted to defects (Effect.die) at the handler level.
 * Effect Platform automatically handles defects as 500 responses.
 */
import type { SqlError } from '@effect/sql/SqlError'
import { Effect } from 'effect'

/**
 * Check if an error is a SqlError
 */
const isSqlError = (e: unknown): e is SqlError =>
  typeof e === 'object' && e !== null && '_tag' in e && e._tag === 'SqlError'

/**
 * Convert SqlError to a defect (untyped error).
 * Effect Platform will handle this as a 500 response.
 *
 * Usage:
 * ```typescript
 * .handle('getUsers', () =>
 *   findUsers().pipe(withSqlErrorAsDefect)
 * )
 * ```
 */
export const withSqlErrorAsDefect = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, Exclude<E, SqlError>, R> =>
  Effect.catchIf(effect, isSqlError, (e) => Effect.die(e)) as Effect.Effect<
    A,
    Exclude<E, SqlError>,
    R
  >
