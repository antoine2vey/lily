import { Absence } from '@lily/api/contexts/absence'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { delegationDetail } from '@lily/api/services/delegation/helpers/delegation-detail'
import { Effect } from 'effect'

export const cancelDelegation = Effect.fn('DelegationService.cancelDelegation')(
  function* (delegationId: string) {
    const { id: by } = yield* CurrentUser
    const absence = yield* Absence
    yield* absence.cancelDelegation({ by, delegationId })
    return yield* delegationDetail(delegationId)
  }
)
