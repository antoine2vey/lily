# Task 04 — Social API Definition

[x] DONE

## Context

Depends on: Task 02 (shared types for request/response schemas).
Defines the HttpApiGroup with all social endpoint signatures. All handler tasks (05–14) depend on this.

## Files to create

- `packages/api/src/services/social/api.ts` — SocialApi HttpApiGroup definition

## Files to modify

None (wiring happens in Task 12).

## Implementation

### `packages/api/src/services/social/api.ts`

```typescript
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  FollowActionResponse,
  NudgeRequest,
  NudgeResponse,
  PublicUserProfile,
  UserCardListResponse,
  UserSearchParams,
  PaginationParams,
} from '@lily/shared'
import {
  AlreadyFollowingError,
  CannotFollowSelfError,
  NotFollowingError,
  NudgeNotAllowedError,
  NudgeRateLimitError,
  UserNotPublicError,
} from '@lily/shared'
import { UserNotFoundError } from '@lily/shared'
import { Schema } from 'effect'

const userIdParam = HttpApiSchema.param('userId', Schema.String)

export const SocialApi = HttpApiGroup.make('social')
  // POST /social/follow/:userId — Follow a user
  .add(
    HttpApiEndpoint.post('followUser')`/follow/${userIdParam}`
      .addSuccess(FollowActionResponse, { status: 201 })
      .addError(AlreadyFollowingError, { status: 409 })
      .addError(CannotFollowSelfError, { status: 400 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(UserNotPublicError, { status: 403 })
  )
  // DELETE /social/follow/:userId — Unfollow a user
  .add(
    HttpApiEndpoint.del('unfollowUser')`/follow/${userIdParam}`
      .addSuccess(FollowActionResponse)
      .addError(NotFollowingError, { status: 404 })
      .addError(CannotFollowSelfError, { status: 400 })
      .addError(UserNotFoundError, { status: 404 })
  )
  // GET /social/followers — Get current user's followers
  .add(
    HttpApiEndpoint.get('getFollowers')`/followers`
      .setUrlParams(PaginationParams)
      .addSuccess(UserCardListResponse)
  )
  // GET /social/following — Get current user's following
  .add(
    HttpApiEndpoint.get('getFollowing')`/following`
      .setUrlParams(PaginationParams)
      .addSuccess(UserCardListResponse)
  )
  // GET /social/users/:userId/followers — Get another user's followers
  .add(
    HttpApiEndpoint.get('getUserFollowers')`/users/${userIdParam}/followers`
      .setUrlParams(PaginationParams)
      .addSuccess(UserCardListResponse)
      .addError(UserNotFoundError, { status: 404 })
      .addError(UserNotPublicError, { status: 403 })
  )
  // GET /social/users/:userId/following — Get another user's following
  .add(
    HttpApiEndpoint.get('getUserFollowing')`/users/${userIdParam}/following`
      .setUrlParams(PaginationParams)
      .addSuccess(UserCardListResponse)
      .addError(UserNotFoundError, { status: 404 })
      .addError(UserNotPublicError, { status: 403 })
  )
  // GET /social/profile/:userId — Get public profile
  .add(
    HttpApiEndpoint.get('getPublicProfile')`/profile/${userIdParam}`
      .addSuccess(PublicUserProfile)
      .addError(UserNotFoundError, { status: 404 })
      .addError(UserNotPublicError, { status: 403 })
  )
  // GET /social/search — Search users
  .add(
    HttpApiEndpoint.get('searchUsers')`/search`
      .setUrlParams(UserSearchParams)
      .addSuccess(UserCardListResponse)
  )
  // GET /social/suggested — Get suggested users
  .add(
    HttpApiEndpoint.get('getSuggestedUsers')`/suggested`
      .addSuccess(Schema.Array(UserCard))
  )
  // POST /social/nudge — Nudge a friend
  .add(
    HttpApiEndpoint.post('sendNudge')`/nudge`
      .setPayload(NudgeRequest)
      .addSuccess(NudgeResponse)
      .addError(NudgeNotAllowedError, { status: 403 })
      .addError(NudgeRateLimitError, { status: 429 })
      .addError(UserNotFoundError, { status: 404 })
  )
  .prefix('/social')
  .middleware(Authentication)
```

### Design notes

- All endpoints require authentication via `Authentication` middleware
- Self-follow is caught with `CannotFollowSelfError` (400)
- Private profile access returns `UserNotPublicError` (403)
- Search is case-insensitive ILIKE on name/username
- Nudge requires following relationship + rate limit (1/day per target)
- Separate `/followers` and `/users/:userId/followers` for own vs other user's lists
- Import `UserCard` from shared (used in `Schema.Array(UserCard)` for suggested)

## Reference

- Copy HttpApiGroup pattern from `packages/api/src/services/plants/api.ts`
- Copy param definition from `HttpApiSchema.param('id', Schema.String)` pattern

## Tests

No unit tests for API definitions — correctness verified by typecheck + handler tests.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run typecheck
```

## Commit

```
feat(social): define SocialApi HttpApiGroup with all endpoint signatures
```
