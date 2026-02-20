import {
  type AiApiCallError,
  type AiGenericError,
  AiService,
} from '@lily/api/services/ai/service'
import type { AIIdentifyResponse } from '@lily/shared'
import { Array, Effect, Option } from 'effect'

export const aiReIdentify = (
  imageUrls: readonly string[],
  locale: string
): Effect.Effect<
  AIIdentifyResponse,
  AiApiCallError | AiGenericError,
  AiService
> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const aiResult = yield* ai.plantRecognition(imageUrls, locale)
    const primaryUrl = Option.getOrElse(Array.head(imageUrls), () => '')
    return { ...aiResult, imageUrl: primaryUrl }
  }).pipe(
    Effect.tapErrorCause((cause) => {
      console.error('[ai-re-identify] FAILED:', cause)
      return Effect.void
    }),
    Effect.withSpan('PlantsService.aiReIdentify')
  )
