import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
} from '@lily/shared'
import { Effect } from 'effect'

export const getDelegation = Effect.fn('DelegationService.getDelegation')(
  function* (delegationId: string) {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository

    const delegation = yield* delegationRepo.findById(delegationId)
    if (!delegation) {
      return yield* new DelegationNotFoundError({ delegationId })
    }

    if (
      delegation.ownerId !== currentUserId &&
      delegation.caretakerId !== currentUserId
    ) {
      return yield* new DelegationNotAuthorizedError({
        message: 'You are not a participant in this delegation',
      })
    }

    return delegation
  }
)
