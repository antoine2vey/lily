import { Data } from 'effect'

/**
 * Invariant violation: a DB mutation (insert/update/delete) succeeded
 * (no SqlError) but returned null from `.returning()`.
 *
 * This is a defect — callers cannot recover. Use with `Effect.die`.
 */
export class EntityMutationDefect extends Data.TaggedError(
  'EntityMutationDefect'
)<{
  readonly message: string
  readonly entity: string
  readonly operation: string
}> {}

/**
 * An async iterable (e.g. AI stream) emitted an error during
 * transformation to an Effect Stream.
 */
export class StreamTransformError extends Data.TaggedError(
  'StreamTransformError'
)<{ readonly message: string; readonly cause?: unknown }> {}
