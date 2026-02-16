import { EventBus, publishWithRetry } from '@lily/api/events'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import {
  AlreadyFollowingError,
  CannotFollowSelfError,
  UserNotFoundError,
  UserNotPublicError,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'

export const followUser = (targetUserId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId, name: currentUserName } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const userRepo = yield* UserRepository
    const eventBus = yield* EventBus
    const notificationRepo = yield* NotificationRepository

    if (currentUserId === targetUserId) {
      return yield* Effect.fail(new CannotFollowSelfError())
    }

    const targetUser = yield* userRepo.findById(targetUserId)
    if (!targetUser) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    if (!targetUser.publicProfile) {
      return yield* Effect.fail(
        new UserNotPublicError({ userId: targetUserId })
      )
    }

    const alreadyFollowing = yield* followRepo.isFollowing(
      currentUserId,
      targetUserId
    )
    if (alreadyFollowing) {
      return yield* Effect.fail(new AlreadyFollowingError({ targetUserId }))
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

    const { title, body } = buildSimpleContent(
      'new_follower',
      { senderName: followerName },
      targetUser.language
    )

    yield* notificationRepo.create({
      userId: targetUserId,
      type: 'new_follower',
      title,
      body,
      scheduledAt: new Date(),
    })

    return { success: true as const }
  }).pipe(Effect.withSpan('SocialService.followUser'))
