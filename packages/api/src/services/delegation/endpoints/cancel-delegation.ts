import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
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
      canceledAt: new Date(),
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

    const { title, body } = buildSimpleContent(
      'delegation_canceled',
      { senderName: ownerName },
      caretakerLanguage
    )

    yield* notificationRepo.create({
      userId: delegation.caretakerId,
      type: 'delegation_canceled',
      title,
      body,
      scheduledAt: new Date(),
    })

    const updated = yield* delegationRepo.findById(delegationId)
    return updated!
  }).pipe(Effect.withSpan('DelegationService.cancelDelegation'))
