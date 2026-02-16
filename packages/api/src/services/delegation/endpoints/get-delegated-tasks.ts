import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const getDelegatedTasks = Effect.gen(function* () {
  const { id: currentUserId } = yield* CurrentUser
  const delegationRepo = yield* DelegationRepository

  return yield* delegationRepo.findActiveDelegationsForCaretaker(currentUserId)
}).pipe(Effect.withSpan('DelegationService.getDelegatedTasks'))
