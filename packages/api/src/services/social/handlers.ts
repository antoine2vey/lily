import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { RedisEventBusLive } from '@lily/api/events'
import { FollowRepositoryLive } from '@lily/api/repositories/follow.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { SocialService } from '@lily/api/services/social/service'
import { Effect, Layer } from 'effect'

export const SocialApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'social', (handlers) =>
    Effect.gen(function* () {
      const socialService = yield* SocialService

      return handlers
        .handle('followUser', ({ path: { userId } }) =>
          socialService.followUser(userId).pipe(withInfraErrorsAsDefect)
        )
        .handle('unfollowUser', ({ path: { userId } }) =>
          socialService.unfollowUser(userId).pipe(withInfraErrorsAsDefect)
        )
        .handle('getFollowers', ({ urlParams }) =>
          socialService.getFollowers(urlParams).pipe(withInfraErrorsAsDefect)
        )
        .handle('getFollowing', ({ urlParams }) =>
          socialService.getFollowing(urlParams).pipe(withInfraErrorsAsDefect)
        )
        .handle('getUserFollowers', ({ path: { userId }, urlParams }) =>
          socialService
            .getUserFollowers(userId, urlParams)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('getUserFollowing', ({ path: { userId }, urlParams }) =>
          socialService
            .getUserFollowing(userId, urlParams)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('getPublicProfile', ({ path: { userId } }) =>
          socialService.getPublicProfile(userId).pipe(withInfraErrorsAsDefect)
        )
        .handle('searchUsers', ({ urlParams }) =>
          socialService.searchUsers(urlParams).pipe(withInfraErrorsAsDefect)
        )
        .handle('getSuggestedUsers', () =>
          socialService.getSuggestedUsers().pipe(withInfraErrorsAsDefect)
        )
        .handle('sendNudge', ({ payload }) =>
          socialService.sendNudge(payload).pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(SocialService.Default),
    Layer.provide(FollowRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(NotificationRepositoryLive),
    Layer.provide(RedisEventBusLive),
    Layer.provide(RedisClientLive),
    Layer.provide(AuthenticationLive)
  )
