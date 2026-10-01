/**
 * Error handling utilities for API handlers
 *
 * Infrastructure errors are converted to defects (Effect.die) at the handler level.
 * Effect Platform automatically handles defects as 500 responses.
 *
 * Scope: SqlError, PlatformError, HttpClientError, HttpServerError, UnknownError.
 * GCS, file-validation, and AI errors are declared on the API endpoints directly.
 */

import type { Cause } from 'effect'
import { Effect } from 'effect'
import type { HttpClientError, HttpServerError } from 'effect/http'
import type { PlatformError } from 'effect/PlatformError'
import type { SqlError } from 'effect/sql/SqlError'

type InfrastructureError =
  | SqlError
  | PlatformError
  | HttpClientError.HttpClientError
  | HttpServerError.HttpServerError
  | Cause.UnknownError

const infraErrorHandlers = {
  SqlError: Effect.die,
  PlatformError: Effect.die,
  HttpClientError: Effect.die,
  HttpServerError: Effect.die,
  UnknownError: Effect.die,
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
