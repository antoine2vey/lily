import { Canopy } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const revokeCanopyInvite = Effect.fn('CanopyService.revokeCanopyInvite')(
  function* () {
    const { id: by } = yield* CurrentUser
    const canopy = yield* Canopy
    yield* canopy.revokeLink({ by })
  }
)
