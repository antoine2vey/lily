import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { PaginationParams } from '@lily/shared'
import {
  parsePaginationParams,
  UserNotFoundError,
  UserNotPublicError,
} from '@lily/shared'
import { Array, Effect } from 'effect'

export const getUserFollowers = (
  targetUserId: string,
  params: PaginationParams
) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const userRepo = yield* UserRepository
    const { page, limit } = parsePaginationParams(params)

    const targetUser = yield* userRepo.findById(targetUserId)
    if (!targetUser) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    if (!targetUser.publicProfile) {
      return yield* Effect.fail(
        new UserNotPublicError({ userId: targetUserId })
      )
    }

    const { items, total } = yield* followRepo.getFollowers({
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
      hasMore: Array.length(items) === limit,
    }
  }).pipe(Effect.withSpan('SocialService.getUserFollowers'))
