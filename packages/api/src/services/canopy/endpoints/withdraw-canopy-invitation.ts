import { Canopy } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { Effect } from 'effect'

export const withdrawCanopyInvitation = Effect.fn(
  'CanopyService.withdrawCanopyInvitation'
)(function* (invitationId: string) {
  const { id: by } = yield* CurrentUser
  const canopy = yield* Canopy
  const { canopyId } = yield* canopy.withdrawInvitation({ by, invitationId })
  return yield* canopyView(canopyId, by)
})
