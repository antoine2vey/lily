import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
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

export const SocialApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'social', (handlers) =>
    handlers
      .handle('followUser', ({ path: { userId } }) =>
        followUser(userId).pipe(withInfraErrorsAsDefect)
      )
      .handle('unfollowUser', ({ path: { userId } }) =>
        unfollowUser(userId).pipe(withInfraErrorsAsDefect)
      )
      .handle('getFollowers', ({ urlParams }) =>
        getFollowers(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('getFollowing', ({ urlParams }) =>
        getFollowing(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('getUserFollowers', ({ path: { userId }, urlParams }) =>
        getUserFollowers(userId, urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('getUserFollowing', ({ path: { userId }, urlParams }) =>
        getUserFollowing(userId, urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('getPublicProfile', ({ path: { userId } }) =>
        getPublicProfile(userId).pipe(withInfraErrorsAsDefect)
      )
      .handle('searchUsers', ({ urlParams }) =>
        searchUsers(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('getSuggestedUsers', () =>
        getSuggestedUsers().pipe(withInfraErrorsAsDefect)
      )
      .handle('sendNudge', ({ payload }) =>
        sendNudge(payload).pipe(withInfraErrorsAsDefect)
      )
  )
