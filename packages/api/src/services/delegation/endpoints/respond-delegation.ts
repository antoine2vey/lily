import { Absence } from '@lily/api/contexts/absence'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { delegationDetail } from '@lily/api/services/delegation/helpers/delegation-detail'
import { Effect } from 'effect'

export const respondToDelegation = Effect.fn(
  'DelegationService.respondToDelegation'
)(function* (delegationId: string, params: { accept: boolean }) {
  const { id: by } = yield* CurrentUser
  const absence = yield* Absence
  yield* absence.respondToDelegation({
    by,
    delegationId,
    accept: params.accept,
  })
  return yield* delegationDetail(delegationId)
})
