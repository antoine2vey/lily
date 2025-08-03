import { HttpServerResponse } from '@effect/platform'
import type { PlatformError } from '@effect/platform/Error'
import type { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import {
  FileService,
  type MultipleFilesError,
  type NoFilesError,
} from '@lily/shared/services/file/fileservice'
import { GCSService, type GCSUploadError } from '@lily/shared/services/file/gcs'
import {
  type AiApiCallError,
  type AiGenericError,
  AiService,
} from '@lily/shared/src/services/ai/service'
import { Effect } from 'effect'

export const aiIdentify = (
  images: readonly PersistedFile[]
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  | GCSUploadError
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

    const stream = yield* ai.plantRecognition(url)

    return HttpServerResponse.stream(stream)
  })
