import type { Outbox } from '@lily/api/kernel/outbox'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { plantsLeftCanopy } from '@lily/api/services/canopy/helpers/plants-left-canopy'
import { Array, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Hands every plant a member shared, alive or dead, back to them as a personal
 * plant with no room. No plant-limit check: a returned plant is not a new
 * plant. Run under the Canopy lock.
 */
export const returnSharedPlants = (
  canopyId: string,
  sharerId: string
): Effect.Effect<
  void,
  SqlError,
  CanopyRepository | NotificationRepository | Outbox
> =>
  Effect.flatMap(CanopyRepository, (repo) =>
    repo.returnToSharer(canopyId, sharerId)
  ).pipe(
    Effect.flatMap((returned) =>
      plantsLeftCanopy(Array.map(returned, (plant) => plant.id))
    ),
    Effect.withSpan('returnSharedPlants', {
      attributes: { 'canopy.id': canopyId, 'user.id': sharerId },
    })
  )
