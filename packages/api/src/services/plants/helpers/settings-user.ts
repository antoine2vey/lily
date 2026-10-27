import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { PlantOwner } from '@lily/shared'
import { Effect } from 'effect'

export const interimSettingsUserFor = (
  owner: PlantOwner
): Effect.Effect<string, never, CurrentUser> =>
  owner._tag === 'User'
    ? Effect.succeed(owner.userId)
    : Effect.map(CurrentUser, (user) => user.id)
