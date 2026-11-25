import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { PaginationParams } from '@lily/shared'
import {
  parsePaginationParams,
  UserNotFoundError,
  UserNotPublicError,
} from '@lily/shared'
import { Effect } from 'effect'

export const getUserFollowing = Effect.fn('SocialService.getUserFollowing')(
  function* (targetUserId: string, params: PaginationParams) {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const { page, limit } = parsePaginationParams(params)

    const targetUser = yield* followRepo.findVisibleUser(targetUserId)
    if (!targetUser) {
      return yield* new UserNotFoundError({
        userId: targetUserId,
      })
    }

    if (!targetUser.publicProfile) {
      return yield* new UserNotPublicError({
        userId: targetUserId,
      })
    }

    const { items, total } = yield* followRepo.getFollowing({
      userId: targetUserId,
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
  }
)
