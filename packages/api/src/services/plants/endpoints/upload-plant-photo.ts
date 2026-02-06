import type { PlatformError } from '@effect/platform/Error'
import { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { nowAsDate } from '@lily/shared'
import {
  type GCSConfigError,
  GCSService,
  type GCSUploadError,
} from '@lily/shared/services/file/gcs'
import { Effect } from 'effect'

export const uploadPlantPhoto = ({
  plantId,
  files,
}: {
  plantId: string
  files: readonly PersistedFile[]
}): Effect.Effect<
  void,
  SqlError | GCSUploadError | GCSConfigError | PlatformError,
  PlantRepository | GCSService | FileSystem | EventBus | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const fileSystem = yield* FileSystem
    const gcs = yield* GCSService
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser

    const photos = yield* Effect.forEach(files, (file) =>
      Effect.gen(function* () {
        const buffer = yield* fileSystem.readFile(file.path)

        const { url } = yield* gcs.uploadFile({
          fileBuffer: Buffer.from(buffer),
          fileName: file.name,
          contentType: file.contentType,
        })

        return { plantId, url, takenAt: nowAsDate() }
      })
    )

    const createdPhotos = yield* repo.addPhotos(photos)

    yield* Effect.forEach(createdPhotos, (photo) =>
      publishWithRetry(
        eventBus.publish({
          _tag: 'PhotoUploaded',
          userId,
          plantId,
          photoId: photo.id,
        })
      )
    )
  })
