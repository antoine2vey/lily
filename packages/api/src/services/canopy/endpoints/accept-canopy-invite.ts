import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { findLiveInvite } from '@lily/api/services/canopy/helpers/invite-token'
import { joinCanopy } from '@lily/api/services/canopy/helpers/join-canopy'
import { Effect } from 'effect'

export const acceptCanopyInvite = Effect.fn('CanopyService.acceptCanopyInvite')(
  function* (token: string) {
    const { id, name } = yield* CurrentUser
    return yield* joinCanopy(
      { id, name },
      {
        findBeforeLock: findLiveInvite(token),
        findUnderLock: findLiveInvite(token),
        markUsed: Effect.void,
      }
    )
  }
)
