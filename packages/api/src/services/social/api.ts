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
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const userIdParam = Schema.String.check(Schema.isGUID())

export const SocialApi = HttpApiGroup.make('social')
  .add(
    HttpApiEndpoint.post('followUser', '/follow/:userId', {
      params: { userId: userIdParam },
      success: FollowActionResponse.pipe(HttpApiSchema.status(201)),
      error: [
        AlreadyFollowingError,
        CannotFollowSelfError,
        UserNotFoundError,
        UserNotPublicError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete('unfollowUser', '/follow/:userId', {
      params: { userId: userIdParam },
      success: FollowActionResponse,
      error: [NotFollowingError, CannotFollowSelfError, UserNotFoundError],
    })
  )
  .add(
    HttpApiEndpoint.get('getFollowers', '/followers', {
      query: PaginationParams,
      success: UserCardListResponse,
    })
  )
  .add(
    HttpApiEndpoint.get('getFollowing', '/following', {
      query: PaginationParams,
      success: UserCardListResponse,
    })
  )
  .add(
    HttpApiEndpoint.get('getUserFollowers', '/users/:userId/followers', {
      params: { userId: userIdParam },
      query: PaginationParams,
      success: UserCardListResponse,
      error: [UserNotFoundError, UserNotPublicError],
    })
  )
  .add(
    HttpApiEndpoint.get('getUserFollowing', '/users/:userId/following', {
      params: { userId: userIdParam },
      query: PaginationParams,
      success: UserCardListResponse,
      error: [UserNotFoundError, UserNotPublicError],
    })
  )
  .add(
    HttpApiEndpoint.get('getPublicProfile', '/profile/:userId', {
      params: { userId: userIdParam },
      success: PublicUserProfile,
      error: [UserNotFoundError, UserNotPublicError],
    })
  )
  .add(
    HttpApiEndpoint.get('searchUsers', '/search', {
      query: UserSearchParams,
      success: UserCardListResponse,
    })
  )
  .add(
    HttpApiEndpoint.get('getSuggestedUsers', '/suggested', {
      success: Schema.Array(UserCard),
    })
  )
  .add(
    HttpApiEndpoint.post('sendNudge', '/nudge', {
      payload: NudgeRequest,
      success: NudgeResponse,
      error: [NudgeNotAllowedError, NudgeRateLimitError, UserNotFoundError],
    })
  )
  .prefix('/social')
  .middleware(Authentication)
