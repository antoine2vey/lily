import { openai } from '@ai-sdk/openai'
import { mapOpenAIError } from '@lily/api/services/ai/map-openai-error'
import { FAST_MODEL } from '@lily/api/services/ai/models'
import type { OpenAIError } from '@lily/shared'
import { generateText, Output } from 'ai'
import { Effect, Option, Schedule, Schema } from 'effect'
import { z } from 'zod'

const enrichmentModel = openai(FAST_MODEL)

const EnrichmentSchema = z.object({
  keywords: z
    .array(z.string())
    .min(3)
    .max(10)
    .describe(
      'Semantic keywords and phrases for plant care search. Include plant names, care topics, symptoms, and specific advice terms.'
    ),
})

export type ChunkEnrichment = z.infer<typeof EnrichmentSchema>

export class EnrichmentError extends Schema.TaggedError<
  EnrichmentError,
  { readonly brand: unique symbol }
>()('EnrichmentError', {
  message: Schema.String,
}) {}

const SYSTEM_PROMPT = `You are a plant care knowledge indexer. Given a plant care text, extract semantic keywords.

Keywords should include: plant names, care topics (watering, light, soil, etc.), specific symptoms or problems, and actionable advice terms.`

export const enrichmentRetryPolicy = Schedule.max([
  Schedule.recurs(3),
  Schedule.exponential('1 second'),
])

export const enrichChunk = (
  content: string
): Effect.Effect<ChunkEnrichment, EnrichmentError | OpenAIError> =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () =>
        generateText({
          model: enrichmentModel,
          maxRetries: 0,
          output: Output.object({ schema: EnrichmentSchema }),
          system: SYSTEM_PROMPT,
          prompt: content,
        }),
      catch: mapOpenAIError('Chunk enrichment'),
    }).pipe(
      Effect.timeoutOrElse({
        duration: '10 seconds',
        orElse: () =>
          Effect.fail(
            new EnrichmentError({ message: 'Enrichment timed out after 10s' })
          ),
      }),
      Effect.retry(enrichmentRetryPolicy)
    )

    return yield* Effect.fromOption(
      Option.fromNullishOr(result.output),
      () => new EnrichmentError({ message: 'Enrichment returned no output' })
    )
  }).pipe(Effect.withSpan('Enrichment.enrichChunk'))
