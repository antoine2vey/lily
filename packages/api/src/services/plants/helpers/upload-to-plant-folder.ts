import { GCSService } from '@lily/api/services/file/gcs'
import type { GCSUploadError } from '@lily/api/services/file/gcs-errors'
import type { InvalidImageError } from '@lily/api/services/file/image-upload'
import { plantFolder } from '@lily/api/services/file/stored-object'
import type { StoredObjectRef } from '@lily/shared/services/file/stored-ref-mint'
import { Effect } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'

export const uploadToPlantFolder = (
  plantId: string,
  file: PersistedFile
): Effect.Effect<
  StoredObjectRef,
  GCSUploadError | InvalidImageError | PlatformError,
  GCSService | FileSystem
> =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const fileSystem = yield* FileSystem
    const buffer = yield* fileSystem.readFile(file.path)
    const { url } = yield* gcs.uploadFile({
      fileBuffer: Buffer.from(buffer),
      folder: plantFolder(plantId),
    })
    return url
  })
