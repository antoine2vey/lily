import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { PlantOwner } from '@lily/shared'
import { Effect } from 'effect'

/**
 * The user whose settings, limit and reminders a plant action uses: the owner
 * of a personal plant, or the acting member of a Canopy plant until C3 gives
 * Canopy plants their own limit and C4 their own reminder recipients.
 */
export const settingsUserFor = (
  owner: PlantOwner
): Effect.Effect<string, never, CurrentUser> =>
  owner._tag === 'User'
    ? Effect.succeed(owner.userId)
    : Effect.map(CurrentUser, (user) => user.id)
