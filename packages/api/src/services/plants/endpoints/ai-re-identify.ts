import { AiService } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type {
  AIIdentifyResponse,
  LimitExceededError,
  OpenAIError,
} from '@lily/shared'
import { Array, Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const aiReIdentify = (
  imageUrls: readonly string[],
  locale: string
): Effect.Effect<
  AIIdentifyResponse,
  OpenAIError | SqlError | LimitExceededError,
  AiService | CurrentUser | UsageTracker
> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const { id: userId } = yield* CurrentUser
    const usageTracker = yield* UsageTracker

    return yield* usageTracker.withReservation(
      userId,
      'plantIdentifies',
      Effect.gen(function* () {
        const aiResult = yield* ai.plantRecognition(imageUrls, locale)
        const primaryUrl = Option.getOrElse(Array.head(imageUrls), () => '')
        return { ...aiResult, imageUrl: primaryUrl }
      })
    )
  }).pipe(Effect.withSpan('PlantsService.aiReIdentify'))
