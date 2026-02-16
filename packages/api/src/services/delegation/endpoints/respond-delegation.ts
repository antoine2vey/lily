import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  type DelegationStatus,
} from '@lily/shared'
import { Effect, Match, Option, pipe } from 'effect'

export const respondToDelegation = (
  delegationId: string,
  params: { accept: boolean }
) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository

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

    const caretakerName = pipe(
      Option.fromNullable(delegation.caretakerName),
      Option.getOrElse(() => 'Someone')
    )

    const owner = yield* userRepo.findById(delegation.ownerId)
    const ownerLanguage = Option.getOrElse(
      Option.fromNullable(owner?.language),
      () => 'en' as const
    )

    const type = params.accept
      ? ('delegation_accepted' as const)
      : ('delegation_rejected' as const)

    const { title, body } = buildSimpleContent(
      type,
      { senderName: caretakerName },
      ownerLanguage
    )

    yield* notificationRepo.create({
      userId: delegation.ownerId,
      type,
      title,
      body,
      scheduledAt: new Date(),
    })

    const updated = yield* delegationRepo.findById(delegationId)
    return updated!
  }).pipe(Effect.withSpan('DelegationService.respondToDelegation'))
