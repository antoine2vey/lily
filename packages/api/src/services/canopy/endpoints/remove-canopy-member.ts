import { Canopy } from '@lily/api/contexts/canopy'
import { transact } from '@lily/api/kernel/transact'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { Effect } from 'effect'

export const removeCanopyMember = Effect.fn('CanopyService.removeCanopyMember')(
  function* (memberUserId: string) {
    const { id: by } = yield* CurrentUser
    const canopy = yield* Canopy
    return yield* transact(
      Effect.flatMap(
        canopy.removeMember({ by, target: memberUserId }),
        ({ canopyId }) => canopyView(canopyId, by)
      )
    )
  }
)
