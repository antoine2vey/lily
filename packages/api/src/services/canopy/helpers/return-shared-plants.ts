import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import {
  type ReminderContext,
  rescheduleReminders,
} from '@lily/api/services/plants/helpers/reconcile-reminders'
import { Array, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Hands every plant a member shared, alive or dead, back to them as a personal
 * plant with no room, and rebuilds its reminders for them. No plant-limit
 * check: a returned plant is not a new plant. Runs inside a lock plan that
 * holds the Canopy and every plant reminder in it.
 */
export const returnSharedPlants = (
  canopyId: string,
  sharerId: string
): Effect.Effect<void, SqlError, ReminderContext> =>
  Effect.flatMap(CanopyRepository, (repo) =>
    repo.returnToSharer(canopyId, sharerId)
  ).pipe(
    Effect.flatMap((returned) =>
      rescheduleReminders(Array.map(returned, (plant) => plant.id))
    ),
    Effect.withSpan('returnSharedPlants', {
      attributes: { 'canopy.id': canopyId, 'user.id': sharerId },
    })
  )
