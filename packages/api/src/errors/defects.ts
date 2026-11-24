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

/**
 * A `chat_conversations` row whose kind disagrees with its plant id, which
 * the check constraint `chat_conversations_kind_plant_consistency` forbids.
 */
export class ConversationKindDefect extends Data.TaggedError(
  'ConversationKindDefect'
)<{
  readonly conversationId: string
  readonly kind: string
  readonly plantId: string | null
}> {}
