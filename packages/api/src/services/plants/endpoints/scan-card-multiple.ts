import { EventBus, publishWithRetry } from '@lily/api/events'
import { ScanRepository } from '@lily/api/repositories/scan.repository'
import { AiService } from '@lily/api/services/ai/service'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import type { LimitExceededError, OpenAIError } from '@lily/shared'
import type { AIIdentifyResponse } from '@lily/shared/plant'
import {
  FileService,
  type FileTooLargeError,
  type InvalidFileTypeError,
  type NoFilesError,
  type TooManyFilesError,
} from '@lily/shared/server'
import { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import { Array as Arr, Effect, Option, pipe } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'
import type { SqlError } from 'effect/sql/SqlError'

export const scanCardMultiple = (
  images: readonly PersistedFile[],
  locale: string
): Effect.Effect<
  AIIdentifyResponse,
  | GCSUploadError
  | GCSConfigError
  | NoFilesError
  | TooManyFilesError
  | InvalidFileTypeError
  | FileTooLargeError
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
        const files = yield* fileService.getUploadedFiles(images, {
          maxFiles: 5,
        })

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
        const result = yield* ai.plantCardScanMultiple(urls, locale)

        const scan = yield* scanRepo.create({ userId, scanType: 'card' })
        yield* publishWithRetry(
          eventBus.publish({
            _tag: 'PlantScanned',
            userId,
            scanId: scan.id,
          })
        )

        // Use first uploaded image as the plant imageUrl
        return {
          ...result,
          imageUrl: pipe(
            Arr.head(urls),
            Option.getOrElse(() => '')
          ),
        }
      })
    )
  }).pipe(
    Effect.withSpan('PlantsService.scanCardMultiple', {
      attributes: { 'scan.imageCount': images.length },
    })
  )
