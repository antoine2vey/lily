import { Canopy } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const declineCanopyInvitation = Effect.fn(
  'CanopyService.declineCanopyInvitation'
)(function* (invitationId: string) {
  const { id: by } = yield* CurrentUser
  const canopy = yield* Canopy
  yield* canopy.declineInvitation({ by, invitationId })
})
