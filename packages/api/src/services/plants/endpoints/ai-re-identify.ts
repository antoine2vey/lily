import { AiService } from '@lily/api/services/ai/service'
import type { AIIdentifyResponse, OpenAIError } from '@lily/shared'
import { Array, Effect, Option } from 'effect'

export const aiReIdentify = (
  imageUrls: readonly string[],
  locale: string
): Effect.Effect<AIIdentifyResponse, OpenAIError, AiService> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const aiResult = yield* ai.plantRecognition(imageUrls, locale)
    const primaryUrl = Option.getOrElse(Array.head(imageUrls), () => '')
    return { ...aiResult, imageUrl: primaryUrl }
  }).pipe(Effect.withSpan('PlantsService.aiReIdentify'))
