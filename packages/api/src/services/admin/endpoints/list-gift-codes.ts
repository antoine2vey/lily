import type { SqlError } from '@effect/sql/SqlError'
import {
  type GiftCodeRecord,
  GiftCodeRepository,
} from '@lily/api/repositories/gift-code.repository'
import {
  type PaginatedResponse,
  type PaginationParams,
  paginate,
  parsePaginationParams,
} from '@lily/shared'
import { Effect } from 'effect'

export const listGiftCodes = (
  params: PaginationParams
): Effect.Effect<
  PaginatedResponse<GiftCodeRecord>,
  SqlError,
  GiftCodeRepository
> =>
  Effect.gen(function* () {
    const repo = yield* GiftCodeRepository
    const { page, limit } = parsePaginationParams(params)

    const { items, total } = yield* repo.findAll({ page, limit })

    return paginate(items, total, page, limit)
  }).pipe(Effect.withSpan('AdminService.listGiftCodes'))
