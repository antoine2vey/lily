import {
  CanopyRepository,
  type MovedPlant,
} from '@lily/api/repositories/canopy.repository'
import {
  type ReminderContext,
  rescheduleReminders,
} from '@lily/api/services/plants/helpers/reconcile-reminders'
import { Array, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Ends a Canopy the caller holds through a Canopy or member change. Every
 * other member's shared plants go back to them, the rest go to the heir,
 * and the row is deleted.
 */
export const dissolveCanopy = (
  canopyId: string,
  heirUserId: string
): Effect.Effect<ReadonlyArray<MovedPlant>, SqlError, ReminderContext> =>
  Effect.gen(function* () {
    const repo = yield* CanopyRepository
    const members = yield* repo.findMembersByJoinDate(canopyId)
    const returned = yield* Effect.forEach(
      Array.filter(members, (m) => m.userId !== heirUserId),
      (m) => repo.returnToSharer(canopyId, m.userId)
    )
    const moved = yield* repo.transferToUser(canopyId, heirUserId)
    yield* repo.delete(canopyId)
    yield* rescheduleReminders(
      Array.map([...Array.flatten(returned), ...moved], (plant) => plant.id)
    )
    return moved
  }).pipe(
    Effect.withSpan('dissolveCanopy', {
      attributes: { 'canopy.id': canopyId },
    })
  )
