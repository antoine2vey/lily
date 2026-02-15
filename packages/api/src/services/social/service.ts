import { followUser } from '@lily/api/services/social/endpoints/follow-user'
import { getFollowers } from '@lily/api/services/social/endpoints/get-followers'
import { getFollowing } from '@lily/api/services/social/endpoints/get-following'
import { getPublicProfile } from '@lily/api/services/social/endpoints/get-public-profile'
import { getSuggestedUsers } from '@lily/api/services/social/endpoints/get-suggested-users'
import { getUserFollowers } from '@lily/api/services/social/endpoints/get-user-followers'
import { getUserFollowing } from '@lily/api/services/social/endpoints/get-user-following'
import { searchUsers } from '@lily/api/services/social/endpoints/search-users'
import { sendNudge } from '@lily/api/services/social/endpoints/send-nudge'
import { unfollowUser } from '@lily/api/services/social/endpoints/unfollow-user'
import { Effect } from 'effect'

export class SocialService extends Effect.Service<SocialService>()(
  'SocialService',
  {
    effect: Effect.succeed({
      followUser,
      unfollowUser,
      getFollowers,
      getFollowing,
      getUserFollowers,
      getUserFollowing,
      getPublicProfile,
      searchUsers,
      getSuggestedUsers,
      sendNudge,
    }),
  }
) {}
