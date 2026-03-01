import type { PlatformError } from '@effect/platform/Error'
import { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { nowAsEpochMillis } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import { Array, Effect, pipe, String } from 'effect'

export const uploadChatImage = ({
  plantId,
  files,
}: {
  plantId: string
  files: readonly PersistedFile[]
}): Effect.Effect<
  { imageUrl: string; imageKey: string },
  | GCSUploadError
  | GCSConfigError
  | PlatformError
  | PlantNotFoundError
  | SqlError,
  GCSService | FileSystem | CurrentUser | PlantRepository
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem
    const gcs = yield* GCSService
    const { id: userId } = yield* CurrentUser
    const plantRepo = yield* PlantRepository

    const plant = yield* plantRepo.findById(plantId)
    yield* pipe(
      Effect.succeed(plant),
      Effect.filterOrFail(
        (p) => p !== null && p.userId === userId,
        () => new PlantNotFoundError({ plantId })
      )
    )

    const file = yield* Array.head(files)
    const buffer = yield* fileSystem.readFile(file.path)

    const timestamp = nowAsEpochMillis()
    const name = pipe(
      file.name,
      String.replaceAll('..', ''),
      String.split('/'),
      Array.last
    )
    const safeName = yield* name
    const fileName = `chat/${plantId}/${timestamp}-${safeName}`

    const { key } = yield* gcs.uploadPrivateFile({
      fileBuffer: Buffer.from(buffer),
      fileName,
      contentType: file.contentType,
    })

    // Generate a signed URL for immediate use (AI processing + preview)
    const signedUrl = yield* gcs.getSignedUrl(key)

    return { imageUrl: signedUrl, imageKey: key }
  }).pipe(
    Effect.withSpan('AIChatService.uploadChatImage', {
      attributes: { 'plant.id': plantId },
    })
  )
