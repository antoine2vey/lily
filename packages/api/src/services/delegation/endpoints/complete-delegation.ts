import { Absence } from '@lily/api/contexts/absence'
import { transact } from '@lily/api/kernel/transact'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { delegationDetail } from '@lily/api/services/delegation/helpers/delegation-detail'
import { Effect } from 'effect'

export const completeDelegation = Effect.fn(
  'DelegationService.completeDelegation'
)(function* (delegationId: string) {
  const { id: by } = yield* CurrentUser
  const absence = yield* Absence
  return yield* transact(
    Effect.andThen(
      absence.completeDelegation({ by, delegationId }),
      delegationDetail(delegationId)
    )
  )
})
