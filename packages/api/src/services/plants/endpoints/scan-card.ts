import type { PlatformError } from '@effect/platform/Error'
import type { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { ScanRepository } from '@lily/api/repositories/scan.repository'
import { AiService } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
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
  | LimitChecker
  | UsageTracker
> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const gcs = yield* GCSService
    const fileService = yield* FileService
    const eventBus = yield* EventBus
    const scanRepo = yield* ScanRepository
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker
    const usageTracker = yield* UsageTracker

    // Check if user has reached their card scan limit
    yield* limitChecker.checkCardScanLimit(userId)

    const file = yield* fileService.getFirstUploadedFile(images)

    const { url } = yield* gcs.uploadPrivateFile({
      fileBuffer: Buffer.from(file.buffer),
      fileName: file.name,
      contentType: file.contentType,
    })

    const result = yield* ai.plantCardScan(url, locale)

    // Record the scan for SCAN_CHAMP achievement
    const scan = yield* scanRepo.create({ userId, scanType: 'card' })

    // Emit PlantScanned event
    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'PlantScanned',
        userId,
        scanId: scan.id,
      })
    )

    // Track usage after successful scan
    yield* usageTracker.trackCardScan(userId)

    return { ...result, imageUrl: url }
  }).pipe(Effect.withSpan('PlantsService.scanCard'))
