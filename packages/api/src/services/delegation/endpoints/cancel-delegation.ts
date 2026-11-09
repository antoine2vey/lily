import {
  DelegationRepository,
  type DelegationRow,
} from '@lily/api/repositories/delegation.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  rebuildDelegationReminders,
  transitionDelegation,
} from '@lily/api/services/delegation/helpers/transition-delegation'
import {
  dispatchNow,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { changeDelegations } from '@lily/api/services/plants/helpers/plant-change'
import {
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  nowAsDate,
} from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

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

    const ownerName = pipe(
      Option.fromNullishOr(delegation.ownerName),
      Option.getOrElse(() => 'Someone')
    )

    const caretaker = yield* userRepo.findById(delegation.caretakerId)
    const caretakerLanguage = Option.getOrElse(
      Option.fromNullishOr(caretaker?.language),
      () => 'en' as const
    )

    const canceledAt = nowAsDate()
    const cancel = Effect.gen(function* () {
      const canceledBeforeStart =
        delegation.status === 'active'
          ? null
          : yield* delegationRepo.transitionStatus(
              delegationId,
              ['pending', 'accepted'],
              'canceled',
              { canceledAt }
            )
      if (canceledBeforeStart !== null) return Array.empty<DelegationRow>()
      return Array.of(
        yield* transitionDelegation({
          delegationId,
          from: ['active'],
          to: 'canceled',
          expectedStatus: 'pending, accepted, or active',
          message: 'This delegation cannot be canceled in its current state',
          timestamps: { canceledAt },
        })
      )
    })
    const notification = yield* changeDelegations(cancel)((handedOver) =>
      rebuildDelegationReminders(handedOver).pipe(
        Effect.andThen(
          recordNotification(
            'delegation_canceled',
            delegation.caretakerId,
            { senderName: ownerName },
            caretakerLanguage,
            { delegationId }
          )
        )
      )
    )

    yield* dispatchNow(notification)

    const updated = yield* delegationRepo.findById(delegationId)
    if (!updated) {
      return yield* new DelegationNotFoundError({ delegationId })
    }
    return updated
  }
)
