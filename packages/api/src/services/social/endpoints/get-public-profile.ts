import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { UserNotFoundError, UserNotPublicError } from '@lily/shared'
import { Effect } from 'effect'

export const getPublicProfile = (targetUserId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository

    const profile = yield* followRepo.getPublicProfile({
      targetUserId,
      currentUserId,
    })

    if (!profile) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    if (!profile.publicProfile) {
      return yield* Effect.fail(
        new UserNotPublicError({ userId: targetUserId })
      )
    }

    return {
      id: profile.id,
      name: profile.name,
      image: profile.image,
      bio: profile.bio,
      plantCount: profile.plantCount,
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
      isFollowing: profile.isFollowing,
      shareGrowthData: profile.shareGrowthData,
      createdAt: profile.createdAt,
    }
  }).pipe(Effect.withSpan('SocialService.getPublicProfile'))
