import { Canopy } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { Effect } from 'effect'

export const removeCanopyMember = Effect.fn('CanopyService.removeCanopyMember')(
  function* (memberUserId: string) {
    const { id: by } = yield* CurrentUser
    const canopy = yield* Canopy
    const { canopyId } = yield* canopy.removeMember({
      by,
      target: memberUserId,
    })
    return yield* canopyView(canopyId, by)
  }
)
