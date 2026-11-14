import { Canopy } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const leaveMyCanopy = Effect.fn('CanopyService.leaveMyCanopy')(
  function* () {
    const { id: by } = yield* CurrentUser
    const canopy = yield* Canopy
    yield* canopy.leave({ by })
  }
)
