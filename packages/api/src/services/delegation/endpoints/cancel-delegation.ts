import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { transitionDelegation } from '@lily/api/services/delegation/helpers/transition-delegation'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import {
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  type DelegationStatus,
  nowAsDate,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'

const CANCELABLE_STATUSES: readonly DelegationStatus[] = [
  'pending',
  'accepted',
  'active',
]

export const cancelDelegation = Effect.fn('DelegationService.cancelDelegation')(
  function* (delegationId: string) {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository
    const userRepo = yield* UserRepository

    const delegation = yield* delegationRepo.findById(delegationId)
    if (!delegation) {
      return yield* new DelegationNotFoundError({ delegationId })
    }

    if (delegation.ownerId !== currentUserId) {
      return yield* new DelegationNotAuthorizedError({
        message: 'Only the delegation owner can cancel',
      })
    }

    yield* transitionDelegation({
      delegationId,
      from: CANCELABLE_STATUSES,
      to: 'canceled',
      expectedStatus: 'pending, accepted, or active',
      message: 'This delegation cannot be canceled in its current state',
      timestamps: { canceledAt: nowAsDate() },
    })

    const ownerName = pipe(
      Option.fromNullishOr(delegation.ownerName),
      Option.getOrElse(() => 'Someone')
    )

    const caretaker = yield* userRepo.findById(delegation.caretakerId)
    const caretakerLanguage = Option.getOrElse(
      Option.fromNullishOr(caretaker?.language),
      () => 'en' as const
    )

    yield* scheduleSimpleNotification(
      'delegation_canceled',
      delegation.caretakerId,
      { senderName: ownerName },
      caretakerLanguage,
      { delegationId }
    )

    const updated = yield* delegationRepo.findById(delegationId)
    if (!updated) {
      return yield* new DelegationNotFoundError({ delegationId })
    }
    return updated
  }
)
