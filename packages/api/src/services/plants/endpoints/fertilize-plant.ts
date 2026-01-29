import type { SqlError } from '@effect/sql/SqlError'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant } from '@lily/shared/plant'
import type { Effect } from 'effect'

export const fertilizePlant = (request: {
  id: string
}): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PlantRepository | CareLogRepository | NotificationRepository | UserRepository
> =>
  executePlantCare({
    plantId: request.id,
    careType: 'fertilization',
  })
