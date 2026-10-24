import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { parsePaginationParams, type UserSearchParams } from '@lily/shared'
import { Effect, String } from 'effect'

// Searching for one letter (or nothing) would list every public user
const MIN_QUERY_LENGTH = 2
const MAX_SEARCH_PAGE_SIZE = 50

export const searchUsers = Effect.fn('SocialService.searchUsers')(function* (
  params: UserSearchParams
) {
  const { id: currentUserId } = yield* CurrentUser
  const followRepo = yield* FollowRepository
  const rateLimiter = yield* RateLimiterService
  const { page, limit } = parsePaginationParams(params, MAX_SEARCH_PAGE_SIZE)
  const query = String.trim(params.query)

  if (query.length < MIN_QUERY_LENGTH) {
    return { items: [], total: 0, page, limit, hasMore: false }
  }

  yield* rateLimiter.checkRateLimit(
    `user-search:${currentUserId}`,
    RATE_LIMITS.USER_SEARCH
  )

  const { items, total } = yield* followRepo.searchUsers({
    query,
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
