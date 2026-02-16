import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  type DelegationStatus,
} from '@lily/shared'
import { Effect } from 'effect'

export const respondToDelegation = (
  delegationId: string,
  params: { accept: boolean }
) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository

    const delegation = yield* delegationRepo.findById(delegationId)
    if (!delegation) {
      return yield* Effect.fail(new DelegationNotFoundError({ delegationId }))
    }

    if (delegation.caretakerId !== currentUserId) {
      return yield* Effect.fail(
        new DelegationNotAuthorizedError({
          message: 'Only the caretaker can respond to a delegation request',
        })
      )
    }

    if (delegation.status !== 'pending') {
      return yield* Effect.fail(
        new DelegationInvalidStatusError({
          currentStatus: delegation.status,
          expectedStatus: 'pending',
          message: 'This delegation has already been responded to',
        })
      )
    }

    const newStatus: DelegationStatus = params.accept ? 'accepted' : 'rejected'
    yield* delegationRepo.updateStatus(delegationId, newStatus, {
      respondedAt: new Date(),
    })

    const updated = yield* delegationRepo.findById(delegationId)
    return updated!
  }).pipe(Effect.withSpan('DelegationService.respondToDelegation'))
