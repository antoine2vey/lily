/**
 * Error handling utilities for API handlers
 *
 * Infrastructure errors are converted to defects (Effect.die) at the handler level.
 * Effect Platform automatically handles defects as 500 responses.
 */
import type { SqlError } from '@effect/sql/SqlError'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs'
import { Effect } from 'effect'

// Union of all infrastructure error types that should become defects
type InfrastructureError =
  | SqlError
  | GCSUploadError
  | GCSConfigError
  | Error
  | { readonly _tag: 'MultipleFilesError' }
  | { readonly _tag: 'NoFilesError' }
  | { readonly _tag: 'TooManyFilesError' }
  | { readonly _tag: 'InvalidFileTypeError' }
  | { readonly _tag: 'FileTooLargeError' }
  | { readonly _tag: 'AiApiCallError' }
  | { readonly _tag: 'AiGenericError' }
  | { readonly _tag: 'RequestError' }
  | { readonly _tag: 'ResponseError' }
  | { readonly _tag: 'SystemError' }
  | { readonly _tag: 'BadArgument' }
  | { readonly _tag: 'PlatformError' }

/**
 * Known infrastructure error class names.
 */
const infrastructureErrorNames = new Set([
  'SqlError',
  'GCSUploadError',
  'GCSConfigError',
  'GCSDeleteError',
  'AiApiCallError',
  'AiGenericError',
  'RequestError',
  'ResponseError',
  'MultipleFilesError',
  'NoFilesError',
  'TooManyFilesError',
  'InvalidFileTypeError',
  'FileTooLargeError',
  'SystemError',
  'BadArgument',
  'PlatformError',
])

/**
 * Check if an error is a SqlError
 */
const isSqlError = (e: unknown): e is SqlError =>
  typeof e === 'object' && e !== null && '_tag' in e && e._tag === 'SqlError'

/**
 * Check if an error is a generic JavaScript Error (not a tagged error)
 */
const isGenericError = (e: unknown): e is Error =>
  e instanceof Error && !('_tag' in e)

/**
 * Check if an error is an infrastructure error that should be a defect.
 */
const isInfrastructureError = (e: unknown): e is InfrastructureError => {
  if (isSqlError(e) || isGenericError(e)) {
    return true
  }

  if (typeof e !== 'object' || e === null) {
    return false
  }

  // Check for tagged errors
  if ('_tag' in e && typeof (e as { _tag: unknown })._tag === 'string') {
    return infrastructureErrorNames.has((e as { _tag: string })._tag)
  }

  // Check for Schema.Class errors by constructor name
  const constructorName = e.constructor?.name
  if (constructorName && infrastructureErrorNames.has(constructorName)) {
    return true
  }

  return false
}

/**
 * Convert infrastructure errors to defects.
 * Effect Platform will handle these as 500 responses.
 *
 * Usage:
 * ```typescript
 * .handle('uploadPhoto', ({ path, payload }) =>
 *   plantsService.uploadPhoto(path.id, payload).pipe(withInfraErrorsAsDefect)
 * )
 * ```
 */
export const withInfraErrorsAsDefect = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, Exclude<E, InfrastructureError>, R> =>
  Effect.catchIf(effect, isInfrastructureError, (e) =>
    Effect.die(e)
  ) as Effect.Effect<A, Exclude<E, InfrastructureError>, R>

// Re-export the SQL-only helper for backwards compatibility
export { withSqlErrorAsDefect } from './sql-error'
