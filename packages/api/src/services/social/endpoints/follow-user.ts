import { EventBus, publishWithRetry } from '@lily/api/events'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { dispatchNow } from '@lily/api/services/helpers/schedule-notification'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
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

  const followerName = pipe(
    Option.fromNullishOr(currentUserName),
    Option.getOrElse(() => 'Someone')
  )

  const params = { senderName: followerName }
  const { title, body } = buildSimpleContent(
    'new_follower',
    params,
    targetUser.language
  )
  const metadata = { senderId: currentUserId }
  const id = yield* followRepo.follow(currentUserId, targetUserId, {
    title,
    body,
    params,
    metadata,
  })

  yield* dispatchNow({
    id,
    type: 'new_follower',
    userId: targetUserId,
    metadata,
  })

  yield* publishWithRetry(
    eventBus.publish({
      _tag: 'UserFollowed',
      followerId: currentUserId,
      followingId: targetUserId,
    })
  )

  return { success: true as const }
})
