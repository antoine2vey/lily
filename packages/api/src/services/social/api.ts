import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  AlreadyFollowingError,
  CannotFollowSelfError,
  FollowActionResponse,
  NotFollowingError,
  NudgeNotAllowedError,
  NudgeRateLimitError,
  NudgeRequest,
  NudgeResponse,
  PaginationParams,
  PublicUserProfile,
  UserCard,
  UserCardListResponse,
  UserNotFoundError,
  UserNotPublicError,
  UserSearchParams,
} from '@lily/shared'
import { Schema } from 'effect'

const userIdParam = HttpApiSchema.param('userId', Schema.String)

export const SocialApi = HttpApiGroup.make('social')
  .add(
    HttpApiEndpoint.post('followUser')`/follow/${userIdParam}`
      .addSuccess(FollowActionResponse, { status: 201 })
      .addError(AlreadyFollowingError)
      .addError(CannotFollowSelfError)
      .addError(UserNotFoundError)
      .addError(UserNotPublicError)
  )
  .add(
    HttpApiEndpoint.del('unfollowUser')`/follow/${userIdParam}`
      .addSuccess(FollowActionResponse)
      .addError(NotFollowingError)
      .addError(CannotFollowSelfError)
      .addError(UserNotFoundError)
  )
  .add(
    HttpApiEndpoint.get('getFollowers')`/followers`
      .setUrlParams(PaginationParams)
      .addSuccess(UserCardListResponse)
  )
  .add(
    HttpApiEndpoint.get('getFollowing')`/following`
      .setUrlParams(PaginationParams)
      .addSuccess(UserCardListResponse)
  )
  .add(
    HttpApiEndpoint.get('getUserFollowers')`/users/${userIdParam}/followers`
      .setUrlParams(PaginationParams)
      .addSuccess(UserCardListResponse)
      .addError(UserNotFoundError)
      .addError(UserNotPublicError)
  )
  .add(
    HttpApiEndpoint.get('getUserFollowing')`/users/${userIdParam}/following`
      .setUrlParams(PaginationParams)
      .addSuccess(UserCardListResponse)
      .addError(UserNotFoundError)
      .addError(UserNotPublicError)
  )
  .add(
    HttpApiEndpoint.get('getPublicProfile')`/profile/${userIdParam}`
      .addSuccess(PublicUserProfile)
      .addError(UserNotFoundError)
      .addError(UserNotPublicError)
  )
  .add(
    HttpApiEndpoint.get('searchUsers')`/search`
      .setUrlParams(UserSearchParams)
      .addSuccess(UserCardListResponse)
  )
  .add(
    HttpApiEndpoint.get('getSuggestedUsers')`/suggested`.addSuccess(
      Schema.Array(UserCard)
    )
  )
  .add(
    HttpApiEndpoint.post('sendNudge')`/nudge`
      .setPayload(NudgeRequest)
      .addSuccess(NudgeResponse)
      .addError(NudgeNotAllowedError)
      .addError(NudgeRateLimitError)
      .addError(UserNotFoundError)
  )
  .prefix('/social')
  .middleware(Authentication)
