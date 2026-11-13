import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import type { Outbox } from '@lily/api/kernel/outbox'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { Array, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Run in the transaction that moved these plants from a Canopy to a user,
 * after the move. Reminders plans the care reminders again; what else anyone
 * but the new owner was waiting to be told about the plants is dropped here,
 * because Reminders reads care reminders only.
 */
export const plantsLeftCanopy = (
  plantIds: ReadonlyArray<string>
): Effect.Effect<void, SqlError, NotificationRepository | Outbox> =>
  Effect.gen(function* () {
    if (Array.isReadonlyArrayEmpty(plantIds)) return
    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.deleteUndeliveredNonCareOfNonOwners(plantIds)
    yield* Reminders.request(Dirty.Plants({ plantIds }))
  })
