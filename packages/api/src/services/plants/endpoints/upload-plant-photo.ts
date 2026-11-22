import { EventBus, publishWithRetry } from '@lily/api/events'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { uploadToPlantFolder } from '@lily/api/services/plants/helpers/upload-to-plant-folder'
import { nowAsDate, type PlantPhotoUploadResponse } from '@lily/shared'
import type { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import type { InvalidImageError } from '@lily/shared/services/file/image-upload'
import { Effect } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'
import type { SqlError } from 'effect/sql/SqlError'

export const uploadPlantPhoto = ({
  plantId,
  files,
}: {
  plantId: string
  files: readonly PersistedFile[]
}): Effect.Effect<
  PlantPhotoUploadResponse,
  | SqlError
  | GCSUploadError
  | InvalidImageError
  | GCSConfigError
  | PlatformError,
  PlantRepository | GCSService | FileSystem | EventBus | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser

    const photos = yield* Effect.forEach(files, (file) =>
      Effect.map(uploadToPlantFolder(plantId, file), (url) => ({
        plantId,
        url,
        takenAt: nowAsDate(),
        uploadedByUserId: userId,
      }))
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

    // Return the persisted photos so the client can reconcile its optimistic
    // placeholder (local uri) with the real id + CDN url without a refetch.
    return { photos: createdPhotos }
  }).pipe(
    Effect.withSpan('PlantsService.uploadPlantPhoto', {
      attributes: { 'plant.id': plantId },
    })
  )
