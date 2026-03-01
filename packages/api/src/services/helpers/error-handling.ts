/**
 * Error handling utilities for API handlers
 *
 * Infrastructure errors are converted to defects (Effect.die) at the handler level.
 * Effect Platform automatically handles defects as 500 responses.
 *
 * Scope: SqlError, RequestError, ResponseError, SystemError, BadArgument, UnknownException.
 * GCS, file-validation, and AI errors are declared on the API endpoints directly.
 */
import type { SqlError } from '@effect/sql/SqlError'
import { Effect } from 'effect'

// Use structural types for platform errors to handle module-boundary aliasing
// (e.g. HttpClientError.RequestError vs HttpServerError.RequestError share the same _tag).
type InfrastructureError =
  | SqlError
  | { readonly _tag: 'RequestError' }
  | { readonly _tag: 'ResponseError' }
  | { readonly _tag: 'SystemError' }
  | { readonly _tag: 'BadArgument' }
  | { readonly _tag: 'UnknownException' }

const infraErrorHandlers = {
  SqlError: Effect.die,
  RequestError: Effect.die,
  ResponseError: Effect.die,
  SystemError: Effect.die,
  BadArgument: Effect.die,
  UnknownException: Effect.die,
} as const

/**
 * Convert infrastructure errors to defects.
 * Effect Platform will handle these as 500 responses.
 *
 * Usage:
 * ```typescript
 * .handle('getPlants', () =>
 *   plantsService.findPlants().pipe(withInfraErrorsAsDefect)
 * )
 * ```
 */
export const withInfraErrorsAsDefect = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, Exclude<E, InfrastructureError>, R> =>
  // biome-ignore lint/suspicious/noExplicitAny: Effect.catchTags handler map can't be typed against a generic E
  Effect.catchTags(effect, infraErrorHandlers as any) as Effect.Effect<
    A,
    Exclude<E, InfrastructureError>,
    R
  >
