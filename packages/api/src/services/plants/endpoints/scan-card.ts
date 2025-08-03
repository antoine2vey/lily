import type { PlatformError } from '@effect/platform/Error'
import type { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
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
import type { ScanCardResponse } from '@lily/shared/plant'
import { Effect } from 'effect'
// Placeholder methods for unimplemented functionality
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
  | AiGenericError,
  AiService | GCSService | FileService | FileSystem
> =>
  Effect.gen(function* () {
    const ai = yield* AiService
    const gcs = yield* GCSService
    const fileService = yield* FileService
    const file = yield* fileService.getFirstUploadedFile(images)

    const { url } = yield* gcs.uploadPrivateFile({
      fileBuffer: Buffer.from(file.buffer),
      fileName: file.name,
      contentType: file.contentType,
    })

    return yield* ai.plantCardScan(url)
  })
