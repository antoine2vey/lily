import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
} from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

const CANCELABLE_STATUSES = ['pending', 'accepted', 'active']

export const cancelDelegation = (delegationId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository
    const notificationRepo = yield* NotificationRepository

    const delegation = yield* delegationRepo.findById(delegationId)
    if (!delegation) {
      return yield* Effect.fail(new DelegationNotFoundError({ delegationId }))
    }

    if (delegation.ownerId !== currentUserId) {
      return yield* Effect.fail(
        new DelegationNotAuthorizedError({
          message: 'Only the delegation owner can cancel',
        })
      )
    }

    if (!Array.contains(CANCELABLE_STATUSES, delegation.status)) {
      return yield* Effect.fail(
        new DelegationInvalidStatusError({
          currentStatus: delegation.status,
          expectedStatus: 'pending, accepted, or active',
          message: 'This delegation cannot be canceled in its current state',
        })
      )
    }

    yield* delegationRepo.updateStatus(delegationId, 'canceled', {
      canceledAt: new Date(),
    })

    const ownerName = pipe(
      Option.fromNullable(delegation.ownerName),
      Option.getOrElse(() => 'Someone')
    )

    yield* notificationRepo.create({
      userId: delegation.caretakerId,
      type: 'delegation_canceled',
      title: 'Delegation canceled',
      body: `${ownerName} canceled the care delegation`,
      scheduledAt: new Date(),
    })

    const updated = yield* delegationRepo.findById(delegationId)
    return updated!
  }).pipe(Effect.withSpan('DelegationService.cancelDelegation'))
