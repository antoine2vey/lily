import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
} from '@lily/shared'
import { Effect } from 'effect'

export const getDelegation = (delegationId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository

    const delegation = yield* delegationRepo.findById(delegationId)
    if (!delegation) {
      return yield* Effect.fail(new DelegationNotFoundError({ delegationId }))
    }

    if (
      delegation.ownerId !== currentUserId &&
      delegation.caretakerId !== currentUserId
    ) {
      return yield* Effect.fail(
        new DelegationNotAuthorizedError({
          message: 'You are not a participant in this delegation',
        })
      )
    }

    return delegation
  }).pipe(Effect.withSpan('DelegationService.getDelegation'))
