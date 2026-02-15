import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  AlreadyFollowingError,
  CannotFollowSelfError,
  UserNotFoundError,
  UserNotPublicError,
} from '@lily/shared'
import { Effect } from 'effect'

export const followUser = (targetUserId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const userRepo = yield* UserRepository

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

    return { success: true as const }
  }).pipe(Effect.withSpan('SocialService.followUser'))
