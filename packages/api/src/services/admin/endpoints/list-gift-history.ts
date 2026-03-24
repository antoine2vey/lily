import type { SqlError } from '@effect/sql/SqlError'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import {
  type PaginatedResponse,
  type PaginationParams,
  paginate,
  parsePaginationParams,
} from '@lily/shared'
import type { AdminGiftEvent } from '@lily/shared/admin'
import { Effect } from 'effect'

export const listGiftHistory = (
  params: PaginationParams
): Effect.Effect<
  PaginatedResponse<AdminGiftEvent>,
  SqlError,
  SubscriptionRepository
> =>
  Effect.gen(function* () {
    const subRepo = yield* SubscriptionRepository
    const { page, limit } = parsePaginationParams(params)

    const { items, total } = yield* subRepo.findGiftEvents({ page, limit })

    return paginate(items, total, page, limit)
  }).pipe(Effect.withSpan('AdminService.listGiftHistory'))
