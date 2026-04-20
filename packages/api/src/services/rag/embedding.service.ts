import { openai } from '@ai-sdk/openai'
import { EmbeddingError } from '@lily/shared/errors/knowledge'
import { embed, embedMany } from 'ai'
import { Array, Effect } from 'effect'

const embeddingModel = openai.embedding('text-embedding-3-large')

export const embedText = (
  text: string
): Effect.Effect<number[], EmbeddingError> =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () =>
        embed({
          model: embeddingModel,
          maxRetries: 0,
          value: text,
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
    if (Array.isEmptyArray(texts)) {
      return []
    }

    const result = yield* Effect.tryPromise({
      try: () =>
        embedMany({
          model: embeddingModel,
          maxRetries: 0,
          values: texts,
          abortSignal: AbortSignal.timeout(60_000),
        }),
      catch: (e) =>
        new EmbeddingError({
          message: `Failed to embed texts: ${String(e)}`,
        }),
    })

    return result.embeddings
  }).pipe(Effect.withSpan('EmbeddingService.embedTexts'))
