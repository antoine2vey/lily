import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { AdminUserListParams } from '@lily/shared/admin'
import {
  paginate,
  parsePaginationParams,
  type PaginatedResponse,
} from '@lily/shared'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'

export const listUsers = (
  params: AdminUserListParams
): Effect.Effect<PaginatedResponse<User>, SqlError, UserRepository> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const { page, limit } = parsePaginationParams(params)

    const filters = {
      page,
      limit,
      ...(params.role && { role: params.role }),
      ...(params.status && { status: params.status }),
      ...(params.search && { search: params.search }),
    }

    const countFilters = {
      ...(params.role && { role: params.role }),
      ...(params.status && { status: params.status }),
      ...(params.search && { search: params.search }),
    }

    const [users, total] = yield* Effect.all([
      repo.findAllPaginated(filters),
      repo.countUsers(countFilters),
    ])

    return paginate(users, total, page, limit)
  })
