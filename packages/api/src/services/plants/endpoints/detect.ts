import { AiService } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { LimitExceededError, OpenAIError } from '@lily/shared'
import type { DetectResponse } from '@lily/shared/plant'
import {
  FileService,
  type MultipleFilesError,
  type NoFilesError,
} from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import type { InvalidImageError } from '@lily/shared/services/file/image-upload'
import { Effect } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'
import type { SqlError } from 'effect/sql/SqlError'

export const detect = (
  images: readonly PersistedFile[],
  locale: string
): Effect.Effect<
  DetectResponse,
  | GCSUploadError
  | InvalidImageError
  | GCSConfigError
  | MultipleFilesError
  | NoFilesError
  | PlatformError
  | OpenAIError
  | SqlError
  | LimitExceededError,
  AiService | GCSService | FileService | FileSystem | CurrentUser | UsageTracker
> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const gcs = yield* GCSService
    const fileService = yield* FileService
    const { id: userId } = yield* CurrentUser
    const usageTracker = yield* UsageTracker

    return yield* usageTracker.withReservation(
      userId,
      'plantIdentifies',
      Effect.gen(function* () {
        const file = yield* fileService.getFirstUploadedFile(images)

        const { url } = yield* gcs.uploadFile({
          fileBuffer: Buffer.from(file.buffer),
          folder: 'detect',
        })

        const aiResult = yield* ai.classifyAndIdentify(url, locale)

        return { ...aiResult, imageUrl: url }
      })
    )
  }).pipe(Effect.withSpan('PlantsService.detect'))
