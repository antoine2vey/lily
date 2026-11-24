import { EventBus, publishWithRetry } from '@lily/api/events'
import { Transaction, transactQuietly } from '@lily/api/kernel/transact'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  dispatchNow,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { signedBy } from '@lily/api/services/notification-scheduler/translations/params'
import {
  AlreadyFollowingError,
  CannotFollowSelfError,
  type LanguageCode,
  UserNotFoundError,
  UserNotPublicError,
} from '@lily/shared'
import { Effect } from 'effect'

/**
 * The follow and the notification it owes commit together. A follow that
 * already exists fails the transaction on its unique violation, so it records
 * no second notification.
 */
export const recordFollow = (
  followerId: string,
  followed: {
    readonly id: string
    readonly language: LanguageCode
    readonly followerName: string | null
  }
) =>
  transactQuietly(
    Effect.gen(function* () {
      const follows = yield* FollowRepository
      const transaction = yield* Transaction
      yield* follows.follow(followerId, followed.id)
      const recorded = yield* recordNotification(
        'new_follower',
        followed.id,
        signedBy(followed.followerName),
        followed.language,
        { senderId: followerId }
      )
      yield* transaction.afterCommit(dispatchNow(recorded))
    })
  )

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

  yield* recordFollow(currentUserId, {
    id: targetUserId,
    language: targetUser.language,
    followerName: currentUserName,
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
