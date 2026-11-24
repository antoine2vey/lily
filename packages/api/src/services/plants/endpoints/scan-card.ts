import { EventBus, publishWithRetry } from '@lily/api/events'
import type { RareIdentificationRepository } from '@lily/api/repositories/rare-identification.repository'
import { ScanRepository } from '@lily/api/repositories/scan.repository'
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
import type { AIIdentifyResponse } from '@lily/shared/plant'
import { Effect } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'
import type { SqlError } from 'effect/sql/SqlError'

export const scanCard = (
  images: readonly PersistedFile[],
  locale: string
): Effect.Effect<
  AIIdentifyResponse,
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
  | EventBus
  | CurrentUser
  | ScanRepository
  | UsageTracker
  | RareIdentificationRepository
> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const gcs = yield* GCSService
    const fileService = yield* FileService
    const eventBus = yield* EventBus
    const scanRepo = yield* ScanRepository
    const { id: userId } = yield* CurrentUser
    const usageTracker = yield* UsageTracker

    return yield* usageTracker.withReservation(
      userId,
      'cardScans',
      Effect.gen(function* () {
        const file = yield* fileService.getFirstUploadedFile(images)

        const { url } = yield* gcs.uploadPrivateFile({
          fileBuffer: Buffer.from(file.buffer),
          folder: userFolder(userId, 'scan-card'),
        })

        const result = yield* ai.plantCardScan(url, locale)

        // Record the scan for SCAN_CHAMP achievement
        const scan = yield* scanRepo.create({ userId, scanType: 'card' })

        yield* publishWithRetry(
          eventBus.publish({
            _tag: 'PlantScanned',
            userId,
            scanId: scan.id,
          })
        )

        const identification = { ...result, imageUrl: url }
        yield* rememberRareIdentification(identification)

        return identification
      })
    )
  }).pipe(Effect.withSpan('PlantsService.scanCard'))
