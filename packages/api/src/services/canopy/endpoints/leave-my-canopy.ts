import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { leaveCanopy } from '@lily/api/services/canopy/helpers/leave-canopy'
import { Effect } from 'effect'

export const leaveMyCanopy = Effect.fn('CanopyService.leaveMyCanopy')(
  function* () {
    const { id: userId } = yield* CurrentUser
    yield* leaveCanopy(userId)
  }
)
