import { EventBus, publishWithRetry } from '@lily/api/events'
import { ScanRepository } from '@lily/api/repositories/scan.repository'
import { AiService } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { LimitExceededError, OpenAIError } from '@lily/shared'
import type { AIIdentifyResponse } from '@lily/shared/plant'
import {
  FileService,
  type MultipleFilesError,
  type NoFilesError,
} from '@lily/shared/server'
import { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
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
          fileName: file.name,
          contentType: file.contentType,
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

        return { ...result, imageUrl: url }
      })
    )
  }).pipe(Effect.withSpan('PlantsService.scanCard'))
