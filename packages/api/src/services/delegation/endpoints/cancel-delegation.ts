import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { scheduleNotification } from '@lily/api/services/helpers/schedule-notification'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  nowAsDate,
} from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

const CANCELABLE_STATUSES = ['pending', 'accepted', 'active']

export const cancelDelegation = (delegationId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository
    const userRepo = yield* UserRepository

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
      canceledAt: nowAsDate(),
    })

    const ownerName = pipe(
      Option.fromNullable(delegation.ownerName),
      Option.getOrElse(() => 'Someone')
    )

    const caretaker = yield* userRepo.findById(delegation.caretakerId)
    const caretakerLanguage = Option.getOrElse(
      Option.fromNullable(caretaker?.language),
      () => 'en' as const
    )

    yield* scheduleNotification(
      'delegation_canceled',
      delegation.caretakerId,
      { senderName: ownerName },
      caretakerLanguage
    )

    const updated = yield* delegationRepo.findById(delegationId)
    if (!updated) {
      return yield* Effect.fail(new DelegationNotFoundError({ delegationId }))
    }
    return updated
  }).pipe(Effect.withSpan('DelegationService.cancelDelegation'))
