import type { RareIdentificationRepository } from '@lily/api/repositories/rare-identification.repository'
import { AiService } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { readClientImage } from '@lily/api/services/helpers/client-image'
import { rememberRareIdentification } from '@lily/api/services/plants/helpers/rare-identification'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type {
  AIIdentifyResponse,
  LimitExceededError,
  OpenAIError,
} from '@lily/shared'
import { GCSService } from '@lily/shared/services/file/gcs'
import type { GCSUploadError } from '@lily/shared/services/file/gcs-errors'
import { InvalidImageError } from '@lily/shared/services/file/image-upload'
import { Array, Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Identifies again from photos the caller uploaded for an earlier answer. The
 * AI gets a link the server signs for each one, never the URL the client sent.
 */
export const aiReIdentify = (
  imageUrls: readonly string[],
  locale: string
): Effect.Effect<
  AIIdentifyResponse,
  | OpenAIError
  | SqlError
  | LimitExceededError
  | InvalidImageError
  | GCSUploadError,
  | AiService
  | GCSService
  | CurrentUser
  | UsageTracker
  | RareIdentificationRepository
> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const gcs = yield* GCSService
    const { id: userId } = yield* CurrentUser
    const usageTracker = yield* UsageTracker

    const keys = yield* Effect.forEach(imageUrls, (url) =>
      Effect.flatMap(readClientImage(url), (image) =>
        image._tag === 'OwnUpload'
          ? Effect.succeed(image.key)
          : Effect.fail(
              new InvalidImageError({
                message: 'Each image must be a photo you uploaded',
              })
            )
      )
    )

    return yield* usageTracker.withReservation(
      userId,
      'plantIdentifies',
      Effect.gen(function* () {
        const signedUrls = yield* Effect.forEach(keys, (key) =>
          gcs.getSignedUrl(key)
        )
        const aiResult = yield* ai.plantRecognition(signedUrls, locale)
        const primaryUrl = Option.getOrElse(Array.head(imageUrls), () => '')
        const identification = { ...aiResult, imageUrl: primaryUrl }
        yield* rememberRareIdentification(identification)
        return identification
      })
    )
  }).pipe(Effect.withSpan('PlantsService.aiReIdentify'))
