import { HttpServerResponse } from '@effect/platform'
import type { PlatformError } from '@effect/platform/Error'
import type { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { LimitExceededError } from '@lily/shared'
import {
  type AiApiCallError,
  type AiGenericError,
  AiService,
} from '@lily/shared/services/ai/service'
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
  images: readonly PersistedFile[]
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
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

    // Check if user has reached their plant identify limit
    yield* limitChecker.checkPlantIdentifyLimit(userId)

    const file = yield* fileService.getFirstUploadedFile(images)

    const { url } = yield* gcs.uploadPrivateFile({
      fileBuffer: Buffer.from(file.buffer),
      fileName: file.name,
      contentType: file.contentType,
    })

    const stream = yield* ai.plantRecognition(url)

    // Track usage after successful identify
    yield* usageTracker.trackPlantIdentify(userId)

    return HttpServerResponse.stream(stream)
  })
