import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import { EventBus, publishWithRetry } from '@lily/api/events'
import type { Outbox } from '@lily/api/kernel/outbox'
import { transact } from '@lily/api/kernel/transact'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { reloadOwnedPlant } from '@lily/api/services/plants/helpers/reload-owned-plant'
import {
  PlantAlreadyDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { PlantDeathRequest } from '@lily/shared/plant'
import { DateTime, Effect, Option } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * "Say goodbye": flag the plant as dead, ask Reminders to drop what it had
 * planned and let the Live Activity subscriber refresh the user's card.
 * Schedule rows are kept on purpose: a revive plans reminders from them.
 */
export const markPlantDead = (
  plant: PlantWithRoom,
  request: PlantDeathRequest,
  requestedId: string = plant.id
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError | PlantAlreadyDeadError,
  PlantRepository | EventBus | CurrentUser | SqlClient.SqlClient | Outbox
> =>
  Effect.gen(function* () {
    if (plant.diedAt !== null) {
      return yield* new PlantAlreadyDeadError()
    }

    const repo = yield* PlantRepository
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser

    yield* transact(
      Effect.gen(function* () {
        const updated = yield* repo.markDead(plant.id, plant.owner, {
          diedAt: DateTime.toDateUtc(DateTime.nowUnsafe()),
          cause: request.cause,
          note: Option.getOrNull(Option.fromNullishOr(request.note)),
        })
        if (!updated) {
          const current = yield* reloadOwnedPlant(plant, requestedId)
          return yield* current.diedAt === null
            ? new PlantNotFoundError({ plantId: requestedId })
            : new PlantAlreadyDeadError()
        }
        yield* Reminders.request(Dirty.Plants({ plantIds: [plant.id] }))
      })
    )

    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'PlantLifecycleChanged',
        userId,
        plantId: plant.id,
      })
    )

    const fresh = yield* repo.findById(plant.id)
    if (!fresh) {
      return yield* new PlantNotFoundError({ plantId: requestedId })
    }
    return fresh
  }).pipe(
    Effect.withSpan('PlantsService.markPlantDead', {
      attributes: { 'plant.id': plant.id, 'plant.death_cause': request.cause },
    })
  )
