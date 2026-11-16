import { openai } from '@ai-sdk/openai'
import { EmbeddingError } from '@lily/shared/errors/knowledge'
import { embed, embedMany } from 'ai'
import { Array, Effect } from 'effect'

const embeddingModel = openai.embedding('text-embedding-3-large')

/**
 * The model rejects an input over 8,192 tokens. A token spans at least one
 * UTF-8 byte, so a text of at most this many bytes always fits.
 */
const MAX_EMBEDDING_INPUT_BYTES = 8000

const encoder = new TextEncoder()

/**
 * The longest prefix of `text` the model is sure to accept. `encodeInto`
 * stops before a character that does not fit whole, so the cut never splits
 * one.
 */
const fitEmbeddingInput = (text: string): string =>
  text.slice(
    0,
    encoder.encodeInto(text, new Uint8Array(MAX_EMBEDDING_INPUT_BYTES)).read
  )

export const embedText = (
  text: string
): Effect.Effect<number[], EmbeddingError> =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () =>
        embed({
          model: embeddingModel,
          maxRetries: 0,
          value: fitEmbeddingInput(text),
          abortSignal: AbortSignal.timeout(30_000),
        }),
      catch: (e) =>
        new EmbeddingError({
          message: `Failed to embed text: ${String(e)}`,
        }),
    })

    return result.embedding
  }).pipe(Effect.withSpan('EmbeddingService.embedText'))

export const embedTexts = (
  texts: string[]
): Effect.Effect<number[][], EmbeddingError> =>
  Effect.gen(function* () {
    if (Array.isArrayEmpty(texts)) {
      return []
    }

    const result = yield* Effect.tryPromise({
      try: () =>
        embedMany({
          model: embeddingModel,
          maxRetries: 0,
          values: Array.map(texts, fitEmbeddingInput),
          abortSignal: AbortSignal.timeout(60_000),
        }),
      catch: (e) =>
        new EmbeddingError({
          message: `Failed to embed texts: ${String(e)}`,
        }),
    })

    return result.embeddings
  }).pipe(Effect.withSpan('EmbeddingService.embedTexts'))
