import { Canopy } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { CANOPY_JOIN_URL_PREFIX, type CanopyInvite } from '@lily/shared'
import { DateTime, Effect } from 'effect'

export const createCanopyInvite = Effect.fn('CanopyService.createCanopyInvite')(
  function* () {
    const { id: by } = yield* CurrentUser
    const canopy = yield* Canopy
    const { token, expiresAt } = yield* canopy.createLink({ by })
    return {
      url: `${CANOPY_JOIN_URL_PREFIX}${token}`,
      expiresAt: DateTime.toDateUtc(expiresAt),
    } satisfies CanopyInvite
  }
)
