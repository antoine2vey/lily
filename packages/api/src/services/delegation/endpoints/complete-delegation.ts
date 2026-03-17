import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  nowAsDate,
} from '@lily/shared'
import { Effect } from 'effect'

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

  if (delegation.status !== 'active') {
    return yield* new DelegationInvalidStatusError({
      currentStatus: delegation.status,
      expectedStatus: 'active',
      message: 'Only active delegations can be completed early',
    })
  }

  yield* delegationRepo.updateStatus(delegationId, 'completed', {
    completedAt: nowAsDate(),
  })

  const updated = yield* delegationRepo.findById(delegationId)
  if (!updated) {
    return yield* new DelegationNotFoundError({ delegationId })
  }
  return updated
})
