import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { PaginationParams } from '@lily/shared'
import { parsePaginationParams } from '@lily/shared'
import { Effect } from 'effect'

export const getFollowers = (params: PaginationParams) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const { page, limit } = parsePaginationParams(params)

    const { items, total } = yield* followRepo.getFollowers({
      userId: currentUserId,
      currentUserId,
      page,
      limit,
    })

    return {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    }
  }).pipe(Effect.withSpan('SocialService.getFollowers'))
