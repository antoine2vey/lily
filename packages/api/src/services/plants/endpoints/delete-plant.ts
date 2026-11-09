import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { changePlant } from '@lily/api/services/plants/helpers/plant-change'
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
  | PlantRepository
  | NotificationRepository
  | CanopyRepository
  | CurrentUser
  | SqlClient.SqlClient
> =>
  changePlant(
    plant,
    requestedId
  )((current) =>
    Effect.flatMap(PlantRepository, (repo) =>
      repo.delete(current.id, current.owner)
    ).pipe(
      Effect.flatMap((deleted) =>
        deleted === null
          ? Effect.fail(new PlantNotFoundError({ plantId: requestedId }))
          : Effect.succeed({ ...plant, room: null, schedules: [] })
      )
    )
  ).pipe(
    Effect.withSpan('PlantsService.deletePlant', {
      attributes: { 'plant.id': plant.id },
    })
  )
