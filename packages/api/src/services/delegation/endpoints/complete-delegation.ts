import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  rebuildDelegationReminders,
  transitionDelegation,
} from '@lily/api/services/delegation/helpers/transition-delegation'
import { changeDelegations } from '@lily/api/services/plants/helpers/plant-change'
import {
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  nowAsDate,
} from '@lily/shared'
import { Array, Effect } from 'effect'

export const completeDelegation = Effect.fn(
  'DelegationService.completeDelegation'
)(function* (delegationId: string) {
  const { id: currentUserId } = yield* CurrentUser
  const delegationRepo = yield* DelegationRepository

  const delegation = yield* delegationRepo.findById(delegationId)
  if (!delegation) {
    return yield* new DelegationNotFoundError({ delegationId })
  }

  if (delegation.ownerId !== currentUserId) {
    return yield* new DelegationNotAuthorizedError({
      message: 'Only the delegation owner can complete early',
    })
  }

  yield* changeDelegations(
    Effect.map(
      transitionDelegation({
        delegationId,
        from: ['active'],
        to: 'completed',
        expectedStatus: 'active',
        message: 'Only active delegations can be completed early',
        timestamps: { completedAt: nowAsDate() },
      }),
      Array.of
    )
  )(rebuildDelegationReminders)

  const updated = yield* delegationRepo.findById(delegationId)
  if (!updated) {
    return yield* new DelegationNotFoundError({ delegationId })
  }
  return updated
})
