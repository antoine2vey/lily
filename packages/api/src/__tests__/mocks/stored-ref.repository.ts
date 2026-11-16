import {
  type ChatRef,
  StoredRefRepository,
} from '@lily/api/repositories/stored-ref.repository'
import { Array, Effect, Layer, Option } from 'effect'

/**
 * The photo columns read as fixed lists: `plant` for the plant's own refs,
 * `avatar` for the user row, `held` for what every column points at.
 */
export const createMockStoredRefRepository = (
  rows: {
    plant?: string[]
    chat?: ChatRef[]
    avatar?: string
    held?: string[]
  } = {}
) =>
  Layer.succeed(StoredRefRepository, {
    ofPlant: () => Effect.succeed(rows.plant ?? []),
    chatOfPlant: () => Effect.succeed(rows.chat ?? []),
    chatOfConversation: () => Effect.succeed(rows.chat ?? []),
    lockAvatar: () => Effect.succeed(Option.fromUndefinedOr(rows.avatar)),
    stillHeld: (refs) =>
      Effect.succeed(
        Array.filter(refs, (ref) => Array.contains(rows.held ?? [], ref))
      ),
  })
