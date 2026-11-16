import {
  type ChatRef,
  type StoredRef,
  StoredRefRepository,
} from '@lily/api/repositories/stored-ref.repository'
import { Effect, Layer, Option, Stream } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * The photo columns read as fixed lists: `plant` for the plant's own refs,
 * `avatar` for the user row, `held` for what every column points at,
 * `everyRef` for the stream of all of them.
 */
export const createMockStoredRefRepository = (
  rows: {
    plant?: string[]
    chat?: ChatRef[]
    avatar?: string
    held?: string[]
    everyRef?: Stream.Stream<StoredRef, SqlError>
  } = {}
) =>
  Layer.succeed(StoredRefRepository, {
    ofPlant: () => Effect.succeed(rows.plant ?? []),
    chatOfPlant: () => Effect.succeed(rows.chat ?? []),
    chatOfConversation: () => Effect.succeed(rows.chat ?? []),
    lockAvatar: () => Effect.succeed(Option.fromUndefinedOr(rows.avatar)),
    stillHeld: () => Effect.succeed(rows.held ?? []),
    everyRef: rows.everyRef ?? Stream.empty,
  })
