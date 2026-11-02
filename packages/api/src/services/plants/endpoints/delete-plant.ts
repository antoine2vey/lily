import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const deletePlant = (
  plant: PlantWithRoom,
  requestedId: string = plant.id
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError,
  PlantRepository | NotificationRepository | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const deleted = yield* withReminderKeys(reminderKeysFor([plant.id]))(
      repo.delete(plant.id, plant.owner)
    )

    if (!deleted) {
      return yield* new PlantNotFoundError({ plantId: requestedId })
    }

    return { ...plant, room: null, schedules: [] }
  }).pipe(
    Effect.withSpan('PlantsService.deletePlant', {
      attributes: { 'plant.id': plant.id },
    })
  )
