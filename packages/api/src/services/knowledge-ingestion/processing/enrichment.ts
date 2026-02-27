import { openai } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { Effect, Schedule, Schema } from 'effect'
import { z } from 'zod'

const enrichmentModel = openai('gpt-4o-mini')

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

export class EnrichmentError extends Schema.TaggedError<EnrichmentError>()(
  'EnrichmentError',
  {
    message: Schema.String,
  }
) {}

const SYSTEM_PROMPT = `You are a plant care knowledge indexer. Given a plant care text, extract semantic keywords.

Keywords should include: plant names, care topics (watering, light, soil, etc.), specific symptoms or problems, and actionable advice terms.`

const retryPolicy = Schedule.intersect(
  Schedule.recurs(3),
  Schedule.exponential('1 second')
)

export const enrichChunk = (
  content: string
): Effect.Effect<ChunkEnrichment, EnrichmentError> =>
  Effect.gen(function* () {
    yield* Effect.log(
      `[enrichment] Calling LLM for chunk (${content.length} chars): "${content.slice(0, 80).replace(/\n/g, ' ')}..."`
    )

    const result = yield* Effect.tryPromise({
      try: () =>
        generateText({
          model: enrichmentModel,
          output: Output.object({ schema: EnrichmentSchema }),
          system: SYSTEM_PROMPT,
          prompt: content,
        }),
      catch: (e) =>
        new EnrichmentError({
          message: `Chunk enrichment failed: ${globalThis.String(e)}`,
        }),
    }).pipe(
      Effect.timeoutFail({
        duration: '10 seconds',
        onTimeout: () =>
          new EnrichmentError({ message: 'Enrichment timed out after 10s' }),
      }),
      Effect.tapError((e) =>
        Effect.logWarning(`[enrichment] Attempt failed: ${e.message}`)
      ),
      Effect.retry(retryPolicy),
      Effect.tapError((e) =>
        Effect.logError(
          '[enrichment] DLQ: chunk failed after 3 attempts, skipping',
          { error: e.message, chunk: content.slice(0, 200) }
        )
      )
    )

    if (!result.output) {
      return yield* Effect.fail(
        new EnrichmentError({ message: 'Enrichment returned no output' })
      )
    }

    yield* Effect.log(
      `[enrichment] Done — keywords: ${result.output.keywords.join(', ')}`
    )

    return result.output
  }).pipe(Effect.withSpan('Enrichment.enrichChunk'))
