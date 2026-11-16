import { transactQuietly } from '@lily/api/kernel/transact'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { StoredRefRepository } from '@lily/api/repositories/stored-ref.repository'
import {
  plantHeld,
  releasing,
} from '@lily/api/services/helpers/release-objects'
import type { GCSService } from '@lily/shared/services/file/gcs'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const deletePlantPhoto = ({
  plantId,
  photoId,
}: {
  plantId: string
  photoId: string
}): Effect.Effect<
  void,
  SqlError,
  PlantRepository | StoredRefRepository | GCSService | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    yield* transactQuietly(
      releasing(plantHeld(plantId), repo.deletePhotoByPlantId(plantId, photoId))
    )
  }).pipe(
    Effect.withSpan('PlantsService.deletePlantPhoto', {
      attributes: { 'plant.id': plantId, 'photo.id': photoId },
    })
  )
