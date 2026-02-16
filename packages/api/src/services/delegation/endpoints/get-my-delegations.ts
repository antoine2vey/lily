import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { paginate, parsePaginationParams } from '@lily/shared'
import { Array, Effect, pipe, String } from 'effect'

export const getMyDelegations = (params: {
  page?: string
  limit?: string
  role?: string
  status?: string
}) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository
    const { page, limit } = parsePaginationParams({
      page: params.page ?? '1',
      limit: params.limit ?? '20',
    })

    const role = pipe(
      params.role ?? 'both',
      (r): 'owner' | 'caretaker' | 'both' =>
        r === 'owner' || r === 'caretaker' ? r : 'both'
    )

    const statusFilter = params.status
      ? pipe(
          String.split(params.status, ','),
          Array.filter((s) => s.length > 0)
        )
      : undefined

    const { items, total } = yield* delegationRepo.findByUser({
      userId: currentUserId,
      role,
      status: statusFilter,
      page,
      limit,
    })

    return paginate(items, total, page, limit)
  }).pipe(Effect.withSpan('DelegationService.getMyDelegations'))
