import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { UserNotFoundError, UserNotPublicError } from '@lily/shared'
import { Effect } from 'effect'

export const getPublicProfile = Effect.fn('SocialService.getPublicProfile')(
  function* (targetUserId: string) {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository

    const profile = yield* followRepo.getPublicProfile({
      targetUserId,
      currentUserId,
    })

    if (!profile) {
      return yield* new UserNotFoundError({ userId: targetUserId })
    }

    if (!profile.publicProfile) {
      return yield* new UserNotPublicError({ userId: targetUserId })
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
      recentPlants: profile.recentPlants,
    }
  }
)
