import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { transitionDelegation } from '@lily/api/services/delegation/helpers/transition-delegation'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import {
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
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

  yield* transitionDelegation({
    delegationId,
    from: ['pending'],
    to: params.accept ? 'accepted' : 'rejected',
    expectedStatus: 'pending',
    message: 'This delegation has already been responded to',
    timestamps: { respondedAt: nowAsDate() },
  })

  const caretakerName = pipe(
    Option.fromNullishOr(delegation.caretakerName),
    Option.getOrElse(() => 'Someone')
  )

  const owner = yield* userRepo.findById(delegation.ownerId)
  const ownerLanguage = Option.getOrElse(
    Option.fromNullishOr(owner?.language),
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
    Option.fromNullishOr(updated),
    Option.match({
      onNone: () => Effect.fail(new DelegationNotFoundError({ delegationId })),
      onSome: Effect.succeed,
    })
  )
})
