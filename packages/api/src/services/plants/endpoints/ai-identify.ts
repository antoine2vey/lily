import type { PlatformError } from '@effect/platform/Error'
import type { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import {
  type AiApiCallError,
  type AiGenericError,
  AiService,
} from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { AIIdentifyResponse, LimitExceededError } from '@lily/shared'
import {
  FileService,
  type MultipleFilesError,
  type NoFilesError,
} from '@lily/shared/services/file/fileservice'
import {
  type GCSConfigError,
  GCSService,
  type GCSUploadError,
} from '@lily/shared/services/file/gcs'
import { Effect } from 'effect'

export const aiIdentify = (
  images: readonly PersistedFile[],
  locale: string
): Effect.Effect<
  AIIdentifyResponse,
  | GCSUploadError
  | GCSConfigError
  | MultipleFilesError
  | NoFilesError
  | PlatformError
  | AiApiCallError
  | AiGenericError
  | SqlError
  | LimitExceededError,
  | AiService
  | GCSService
  | FileService
  | FileSystem
  | CurrentUser
  | LimitChecker
  | UsageTracker
> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const gcs = yield* GCSService
    const fileService = yield* FileService
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker
    const usageTracker = yield* UsageTracker

    yield* limitChecker.checkPlantIdentifyLimit(userId)

    const file = yield* fileService.getFirstUploadedFile(images)

    const { url } = yield* gcs.uploadFile({
      fileBuffer: Buffer.from(file.buffer),
      fileName: file.name,
      contentType: file.contentType,
    })

    const aiResult = yield* ai.plantRecognitionWithRetry(url, locale)

    yield* usageTracker.trackPlantIdentify(userId)

    return { ...aiResult, imageUrl: url }
  }).pipe(
    Effect.tapErrorCause((cause) => {
      console.error('[ai-identify] FAILED:', cause)
      return Effect.void
    }),
    Effect.withSpan('PlantsService.aiIdentify')
  )
