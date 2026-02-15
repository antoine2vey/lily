import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'

// Public user profile (what others see)
export const PublicUserProfile = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String),
  bio: Schema.NullOr(Schema.String),
  plantCount: Schema.Number,
  followerCount: Schema.Number,
  followingCount: Schema.Number,
  isFollowing: Schema.Boolean,
  shareGrowthData: Schema.Boolean,
  createdAt: Schema.Date,
})
export type PublicUserProfile = typeof PublicUserProfile.Type

// Compact user card (for lists: search results, followers, following)
export const UserCard = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String),
  plantCount: Schema.Number,
  isFollowing: Schema.Boolean,
})
export type UserCard = typeof UserCard.Type

// Follow/unfollow response
export const FollowActionResponse = Schema.Struct({
  success: Schema.Boolean,
})
export type FollowActionResponse = typeof FollowActionResponse.Type

// Nudge request
export const NudgeRequest = Schema.Struct({
  targetUserId: Schema.String,
})
export type NudgeRequest = typeof NudgeRequest.Type

// Nudge response
export const NudgeResponse = Schema.Struct({
  success: Schema.Boolean,
})
export type NudgeResponse = typeof NudgeResponse.Type

// Search query params
export const UserSearchParams = Schema.Struct({
  query: Schema.String,
  page: Schema.optionalWith(Schema.String, { default: () => '1' }),
  limit: Schema.optionalWith(Schema.String, { default: () => '20' }),
})
export type UserSearchParams = typeof UserSearchParams.Type

// Paginated responses
export const UserCardListResponse = PaginatedResponse(UserCard)
export type UserCardListResponse = typeof UserCardListResponse.Type
