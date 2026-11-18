import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { DelegationNotFoundError } from '@lily/shared'
import { Effect, Option } from 'effect'

export const delegationDetail = Effect.fn('DelegationService.delegationDetail')(
  function* (delegationId: string) {
    const delegations = yield* DelegationRepository
    return yield* Effect.fromOption(
      Option.fromNullishOr(yield* delegations.findById(delegationId)),
      () => new DelegationNotFoundError({ delegationId })
    )
  }
)
