import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { leaveCanopyAndDelete } from '@lily/api/services/canopy/helpers/leave-canopy'
import { Array, Effect } from 'effect'

/**
 * Deletes an account for good, with everything that goes by cascade. The
 * delegations the user tended plants under go in that cascade, so Reminders
 * is first asked to plan those plants again: their reminders return to their
 * owners. Returns null when the account does not exist.
 */
export const purgeAccount = (userId: string) =>
  leaveCanopyAndDelete(userId)(
    Effect.gen(function* () {
      const plantRepo = yield* PlantRepository
      const userRepo = yield* UserRepository
      const tended = Array.difference(
        yield* plantRepo.findPersonalReminderPlantIds(userId),
        yield* plantRepo.findIdsOwnedBy(userId)
      )
      yield* Reminders.request(Dirty.Plants({ plantIds: tended }))
      return yield* userRepo.delete(userId)
    })
  ).pipe(Effect.withSpan('purgeAccount', { attributes: { 'user.id': userId } }))
