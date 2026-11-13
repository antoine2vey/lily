import { Canopy, JoinVia } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { Effect } from 'effect'

export const acceptCanopyInvite = Effect.fn('CanopyService.acceptCanopyInvite')(
  function* (token: string) {
    const { id: joiner } = yield* CurrentUser
    const canopy = yield* Canopy
    const { canopyId } = yield* canopy.join({
      joiner,
      via: JoinVia.Link({ token }),
    })
    return yield* canopyView(canopyId, joiner)
  }
)
