import type { PlatformError } from '@effect/platform/Error'
import type { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { ScanRepository } from '@lily/api/repositories/scan.repository'
import {
  type AiApiCallError,
  type AiGenericError,
  AiService,
} from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { LimitExceededError } from '@lily/shared'
import type { AIIdentifyResponse } from '@lily/shared/plant'
import {
  FileService,
  type FileTooLargeError,
  type GCSConfigError,
  GCSService,
  type GCSUploadError,
  type InvalidFileTypeError,
  type NoFilesError,
  type TooManyFilesError,
} from '@lily/shared/server'
import { Array as Arr, Effect, Option, pipe } from 'effect'

export const scanCardMultiple = (
  images: readonly PersistedFile[]
): Effect.Effect<
  AIIdentifyResponse,
  | GCSUploadError
  | GCSConfigError
  | NoFilesError
  | TooManyFilesError
  | InvalidFileTypeError
  | FileTooLargeError
  | PlatformError
  | AiApiCallError
  | AiGenericError
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

    // Check if user has reached their card scan limit before uploading
    yield* limitChecker.checkCardScanLimit(userId)

    // Validate and read all files
    const files = yield* fileService.getUploadedFiles(images, { maxFiles: 5 })

    // Upload all images to GCS in parallel
    const uploadResults = yield* Effect.all(
      Arr.map(files, (file) =>
        gcs.uploadFile({
          fileBuffer: Buffer.from(file.buffer),
          fileName: file.name,
          contentType: file.contentType,
        })
      ),
      { concurrency: 'unbounded' }
    )

    const urls = Arr.map(uploadResults, (r) => r.url)

    // Single AI call with all images — returns one plant result
    const result = yield* ai.plantCardScanMultiple(urls)

    // Record scan and track usage (single scan, multiple images)
    const scan = yield* scanRepo.create({ userId, scanType: 'card' })
    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'PlantScanned',
        userId,
        scanId: scan.id,
      })
    )
    yield* usageTracker.trackCardScan(userId)

    // Use first uploaded image as the plant imageUrl
    return {
      ...result,
      imageUrl: pipe(
        Arr.head(urls),
        Option.getOrElse(() => '')
      ),
    }
  }).pipe(
    Effect.withSpan('PlantsService.scanCardMultiple', {
      attributes: { 'scan.imageCount': images.length },
    })
  )
