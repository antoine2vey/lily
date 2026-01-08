import type { PlatformError } from '@effect/platform/Error'
import type { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { ScanRepository } from '@lily/api/repositories/scan.repository'
import { Session } from '@lily/api/services/auth/session'
import {
  type AiApiCallError,
  type AiGenericError,
  AiService,
  FileService,
  type GCSConfigError,
  GCSService,
  type GCSUploadError,
  type MultipleFilesError,
  type NoFilesError,
} from '@lily/shared'
import type { SessionNotFoundError } from '@lily/shared/errors/user'
import type { ScanCardResponse } from '@lily/shared/plant'
import { Effect } from 'effect'

export const scanCard = (
  images: readonly PersistedFile[]
): Effect.Effect<
  ScanCardResponse,
  | GCSUploadError
  | GCSConfigError
  | MultipleFilesError
  | NoFilesError
  | PlatformError
  | AiApiCallError
  | AiGenericError
  | SqlError
  | SessionNotFoundError,
  | AiService
  | GCSService
  | FileService
  | FileSystem
  | EventBus
  | Session
  | ScanRepository
> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const gcs = yield* GCSService
    const fileService = yield* FileService
    const eventBus = yield* EventBus
    const scanRepo = yield* ScanRepository
    const { userId } = yield* Session

    const file = yield* fileService.getFirstUploadedFile(images)

    const { url } = yield* gcs.uploadPrivateFile({
      fileBuffer: Buffer.from(file.buffer),
      fileName: file.name,
      contentType: file.contentType,
    })

    const result = yield* ai.plantCardScan(url)

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

    return result
  })
