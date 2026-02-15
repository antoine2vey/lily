# Task 02 — Shared Social Types

[x] DONE

## Context

Depends on: Task 01 (schema must exist for type alignment).
Creates the shared schemas and error types used by both the API and mobile app for all social features. Must be done before any endpoint or hook work.

## Files to create

- `packages/shared/src/domains/social/schema.ts` — Social domain schemas
- `packages/shared/src/domains/social/errors.ts` — Social domain errors

## Files to modify

- `packages/shared/src/index.ts` — add exports for social domain

## Implementation

### Schema (`schema.ts`)

```typescript
import { Schema } from 'effect'
import { PaginatedResponse } from '@lily/shared'

// Public user profile (what others see)
export const PublicUserProfile = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  username: Schema.NullOr(Schema.String),
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
  username: Schema.NullOr(Schema.String),
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
```

### Errors (`errors.ts`)

```typescript
import { Schema } from 'effect'
import { HttpApiSchema } from '@effect/platform'

export class UserNotPublicError extends Schema.TaggedError<UserNotPublicError>()(
  'UserNotPublicError',
  {
    userId: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export class AlreadyFollowingError extends Schema.TaggedError<AlreadyFollowingError>()(
  'AlreadyFollowingError',
  {
    targetUserId: Schema.String,
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class NotFollowingError extends Schema.TaggedError<NotFollowingError>()(
  'NotFollowingError',
  {
    targetUserId: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class CannotFollowSelfError extends Schema.TaggedError<CannotFollowSelfError>()(
  'CannotFollowSelfError',
  {},
  HttpApiSchema.annotations({ status: 400 })
) {}

export class NudgeRateLimitError extends Schema.TaggedError<NudgeRateLimitError>()(
  'NudgeRateLimitError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You can only nudge this user once per day',
    }),
  },
  HttpApiSchema.annotations({ status: 429 })
) {}

export class NudgeNotAllowedError extends Schema.TaggedError<NudgeNotAllowedError>()(
  'NudgeNotAllowedError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'You can only nudge users you follow',
    }),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}
```

### Export in `index.ts`

Add to `packages/shared/src/index.ts`:
```typescript
export * from './domains/social/schema'
export * from './domains/social/errors'
```

## Reference

- Copy schema pattern from `packages/shared/src/domains/plant/schema.ts`
- Copy error pattern from `packages/shared/src/domains/subscriptions/errors.ts`
- Copy PaginatedResponse usage from `packages/shared/src/domains/plant/schema.ts`

## Tests

No unit tests for schema/error type definitions — correctness verified by typecheck.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/shared && bun run typecheck
```

## Commit

```
feat(social): add shared social schemas and error types
```
