import { PlantLife } from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import type { StoredRefRepository } from '@lily/api/repositories/stored-ref.repository'
import {
  plantAndChatHeld,
  releasing,
} from '@lily/api/services/helpers/release-objects'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { GCSService } from '@lily/shared/services/file/gcs'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const deletePlant = (
  plant: PlantWithRoom,
  permit: PlantPermit<'delete'>
): Effect.Effect<
  PlantWithRoom,
  PlantNotFoundError | SqlError,
  PlantLife | StoredRefRepository | GCSService | SqlClient.SqlClient | Outbox
> =>
  Effect.gen(function* () {
    const life = yield* PlantLife

    yield* transact(
      releasing(
        plantAndChatHeld(plant.id),
        life.remove({ permit, seenOwner: plant.owner }),
        [{ _tag: 'Plant', plantId: plant.id }]
      )
    )

    return { ...plant, room: null, schedules: [] }
  }).pipe(
    Effect.withSpan('PlantsService.deletePlant', {
      attributes: { 'plant.id': plant.id },
    })
  )
