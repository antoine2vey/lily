import { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { Session } from '@lily/api/services/auth/session'
import type { SessionNotFoundError } from '@lily/shared/errors/user'
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
  SqlError | GCSUploadError | GCSConfigError | SessionNotFoundError,
  PlantRepository | GCSService | FileSystem | EventBus | Session
> => {
  return Effect.gen(function* () {
    const repo = yield* PlantRepository
    const fileSystem = yield* FileSystem
    const gcs = yield* GCSService
    const eventBus = yield* EventBus
    const { userId } = yield* Session
    const photos: Array<{ plantId: string; url: string; takenAt: Date }> = []

    for (const file of files) {
      const buffer = yield* fileSystem.readFile(file.path)

      const { url } = yield* gcs.uploadFile({
        fileBuffer: Buffer.from(buffer),
        fileName: file.name,
        contentType: file.contentType,
      })

      photos.push({ plantId, url, takenAt: new Date() })
    }

    const createdPhotos = yield* repo.addPhotos(photos)

    // Emit PhotoUploaded event for each photo
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
}
