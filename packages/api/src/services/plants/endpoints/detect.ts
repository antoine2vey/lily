import type { RareIdentificationRepository } from '@lily/api/repositories/rare-identification.repository'
import { AiService } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  FileService,
  type MultipleFilesError,
  type NoFilesError,
} from '@lily/api/services/file/fileservice'
import { GCSService } from '@lily/api/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/api/services/file/gcs-errors'
import type { InvalidImageError } from '@lily/api/services/file/image-upload'
import { userFolder } from '@lily/api/services/file/stored-object'
import { rememberRareIdentification } from '@lily/api/services/plants/helpers/rare-identification'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { LimitExceededError, OpenAIError } from '@lily/shared'
import type { DetectResponse } from '@lily/shared/plant'
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
  | AiService
  | GCSService
  | FileService
  | FileSystem
  | CurrentUser
  | UsageTracker
  | RareIdentificationRepository
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

        const { url } = yield* gcs.uploadPrivateFile({
          fileBuffer: Buffer.from(file.buffer),
          folder: userFolder(userId, 'detect'),
        })

        const aiResult = yield* ai.classifyAndIdentify(url, locale)
        const identification = { ...aiResult, imageUrl: url }
        yield* rememberRareIdentification(identification)

        return identification
      })
    )
  }).pipe(Effect.withSpan('PlantsService.detect'))
