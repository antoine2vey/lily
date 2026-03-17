import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  CannotFollowSelfError,
  NotFollowingError,
  UserNotFoundError,
} from '@lily/shared'
import { Effect } from 'effect'

export const unfollowUser = Effect.fn('SocialService.unfollowUser')(function* (
  targetUserId: string
) {
  const { id: currentUserId } = yield* CurrentUser
  const followRepo = yield* FollowRepository
  const userRepo = yield* UserRepository

  if (currentUserId === targetUserId) {
    return yield* new CannotFollowSelfError()
  }

  const targetUser = yield* userRepo.findById(targetUserId)
  if (!targetUser) {
    return yield* new UserNotFoundError({
      userId: targetUserId,
    })
  }

  const isFollowing = yield* followRepo.isFollowing(currentUserId, targetUserId)
  if (!isFollowing) {
    return yield* new NotFollowingError({ targetUserId })
  }

  yield* followRepo.unfollow(currentUserId, targetUserId)

  return { success: true as const }
})
