import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { parsePaginationParams, type UserSearchParams } from '@lily/shared'
import { Effect } from 'effect'

export const searchUsers = Effect.fn('SocialService.searchUsers')(function* (
  params: UserSearchParams
) {
  const { id: currentUserId } = yield* CurrentUser
  const followRepo = yield* FollowRepository
  const { page, limit } = parsePaginationParams(params)

  const { items, total } = yield* followRepo.searchUsers({
    query: params.query,
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
})
