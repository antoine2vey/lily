import { Canopy, JoinVia } from '@lily/api/contexts/canopy'
import { transact } from '@lily/api/kernel/transact'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { Effect } from 'effect'

export const acceptCanopyInvitation = Effect.fn(
  'CanopyService.acceptCanopyInvitation'
)(function* (invitationId: string) {
  const { id: joiner } = yield* CurrentUser
  const canopy = yield* Canopy
  return yield* transact(
    Effect.flatMap(
      canopy.join({ joiner, via: JoinVia.Invitation({ invitationId }) }),
      ({ canopyId }) => canopyView(canopyId, joiner)
    )
  )
})
