import { EventBus, publishWithRetry } from '@lily/api/events'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import {
  AlreadyFollowingError,
  CannotFollowSelfError,
  UserNotFoundError,
  UserNotPublicError,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'

export const followUser = Effect.fn('SocialService.followUser')(function* (
  targetUserId: string
) {
  const { id: currentUserId, name: currentUserName } = yield* CurrentUser
  const followRepo = yield* FollowRepository
  const userRepo = yield* UserRepository
  const eventBus = yield* EventBus

  if (currentUserId === targetUserId) {
    return yield* new CannotFollowSelfError()
  }

  const targetUser = yield* userRepo.findById(targetUserId)
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

  const alreadyFollowing = yield* followRepo.isFollowing(
    currentUserId,
    targetUserId
  )
  if (alreadyFollowing) {
    return yield* new AlreadyFollowingError({ targetUserId })
  }

  yield* followRepo.follow(currentUserId, targetUserId)

  // Publish UserFollowed event
  yield* publishWithRetry(
    eventBus.publish({
      _tag: 'UserFollowed',
      followerId: currentUserId,
      followingId: targetUserId,
    })
  )

  // Create push notification for the followed user
  const followerName = pipe(
    Option.fromNullable(currentUserName),
    Option.getOrElse(() => 'Someone')
  )

  yield* scheduleSimpleNotification(
    'new_follower',
    targetUserId,
    { senderName: followerName },
    targetUser.language,
    { senderId: currentUserId }
  )

  return { success: true as const }
})
