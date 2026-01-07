import { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
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
  SqlError | GCSUploadError | GCSConfigError,
  PlantRepository | GCSService | FileSystem
> => {
  return Effect.gen(function* () {
    const repo = yield* PlantRepository
    const fileSystem = yield* FileSystem
    const gcs = yield* GCSService
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

    yield* repo.addPhotos(photos)
  })
}
