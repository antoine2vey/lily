import { coversRecordOf, type RecordPermit } from '@lily/api/kernel/permit'
import { transactQuietly } from '@lily/api/kernel/transact'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { StoredRefRepository } from '@lily/api/repositories/stored-ref.repository'
import type { GCSService } from '@lily/api/services/file/gcs'
import {
  plantHeld,
  releasing,
} from '@lily/api/services/helpers/release-objects'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import { Effect, Option } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * A `photo` permit reaches only the photos its actor uploaded. A photo that
 * is not on the permit's plant answers as a delete that went through, so the
 * answer tells nothing about a photo of another plant.
 */
export const deletePlantPhoto = (
  permit: RecordPermit<'photo'>,
  photoId: string
): Effect.Effect<
  void,
  PlantNotAuthorizedError | SqlError,
  PlantRepository | StoredRefRepository | GCSService | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    yield* transactQuietly(
      releasing(
        plantHeld(permit.plantId),
        Effect.flatMap(
          repo.lockPhoto(permit.plantId, photoId),
          Option.match({
            onNone: () => Effect.void,
            onSome: (
              photo
            ): Effect.Effect<void, PlantNotAuthorizedError | SqlError> =>
              coversRecordOf(
                permit,
                Option.fromNullishOr(photo.uploadedByUserId)
              )
                ? repo.deletePhotoByPlantId(permit.plantId, photoId)
                : Effect.fail(new PlantNotAuthorizedError()),
          })
        )
      )
    )
  }).pipe(
    Effect.withSpan('PlantsService.deletePlantPhoto', {
      attributes: { 'plant.id': permit.plantId, 'photo.id': photoId },
    })
  )
