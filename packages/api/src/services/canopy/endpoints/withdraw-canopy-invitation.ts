import { Canopy } from '@lily/api/contexts/canopy'
import { transact } from '@lily/api/kernel/transact'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { Effect } from 'effect'

export const withdrawCanopyInvitation = Effect.fn(
  'CanopyService.withdrawCanopyInvitation'
)(function* (invitationId: string) {
  const { id: by } = yield* CurrentUser
  const canopy = yield* Canopy
  return yield* transact(
    Effect.flatMap(
      canopy.withdrawInvitation({ by, invitationId }),
      ({ canopyId }) => canopyView(canopyId, by)
    )
  )
})
