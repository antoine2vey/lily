import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import {
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  type DelegationStatus,
  nowAsDate,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'

export const respondToDelegation = Effect.fn(
  'DelegationService.respondToDelegation'
)(function* (delegationId: string, params: { accept: boolean }) {
  const { id: currentUserId } = yield* CurrentUser
  const delegationRepo = yield* DelegationRepository
  const userRepo = yield* UserRepository

  const delegation = yield* delegationRepo.findById(delegationId)
  if (!delegation) {
    return yield* new DelegationNotFoundError({ delegationId })
  }

  if (delegation.caretakerId !== currentUserId) {
    return yield* new DelegationNotAuthorizedError({
      message: 'Only the caretaker can respond to a delegation request',
    })
  }

  if (delegation.status !== 'pending') {
    return yield* new DelegationInvalidStatusError({
      currentStatus: delegation.status,
      expectedStatus: 'pending',
      message: 'This delegation has already been responded to',
    })
  }

  const newStatus: DelegationStatus = params.accept ? 'accepted' : 'rejected'
  yield* delegationRepo.updateStatus(delegationId, newStatus, {
    respondedAt: nowAsDate(),
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

  yield* scheduleSimpleNotification(
    type,
    delegation.ownerId,
    { senderName: caretakerName },
    ownerLanguage,
    { delegationId }
  )

  const updated = yield* delegationRepo.findById(delegationId)
  return yield* pipe(
    Option.fromNullable(updated),
    Option.match({
      onNone: () => Effect.fail(new DelegationNotFoundError({ delegationId })),
      onSome: Effect.succeed,
    })
  )
})
