import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import {
  PlantAlreadyDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { PlantDeathRequest } from '@lily/shared/plant'
import { DateTime, Effect, Option } from 'effect'

/**
 * "Say goodbye": flag the plant as dead, drop its pending reminders and let
 * the Live Activity subscriber refresh the user's card. Schedule rows are
 * kept on purpose — `revive-plant` rebuilds reminders from them.
 */
export const markPlantDead = (
  plant: PlantWithRoom,
  request: PlantDeathRequest
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError | PlantAlreadyDeadError,
  PlantRepository | NotificationRepository | EventBus
> =>
  Effect.gen(function* () {
    if (plant.diedAt !== null) {
      return yield* new PlantAlreadyDeadError()
    }

    const repo = yield* PlantRepository
    const notificationRepo = yield* NotificationRepository
    const eventBus = yield* EventBus

    const updated = yield* repo.markDead(plant.id, {
      diedAt: DateTime.toDateUtc(DateTime.unsafeNow()),
      cause: request.cause,
      note: Option.getOrNull(Option.fromNullable(request.note)),
    })
    if (!updated) {
      return yield* new PlantNotFoundError({ plantId: plant.id })
    }

    yield* notificationRepo.deletePendingByPlantId(plant.id)

    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'PlantLifecycleChanged',
        userId: plant.userId,
        plantId: plant.id,
      })
    )

    const fresh = yield* repo.findById(plant.id)
    if (!fresh) {
      return yield* new PlantNotFoundError({ plantId: plant.id })
    }
    return fresh
  }).pipe(
    Effect.withSpan('PlantsService.markPlantDead', {
      attributes: { 'plant.id': plant.id, 'plant.death_cause': request.cause },
    })
  )
