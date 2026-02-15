# Task 07 — Get Followers Endpoint

[x] DONE

## Context

Depends on: Task 03 (FollowRepository), Task 04 (SocialApi definition).
Implements two endpoints:
- `GET /api/social/followers` — current user's followers
- `GET /api/social/users/:userId/followers` — another user's followers

## Files to create

- `packages/api/src/services/social/endpoints/get-followers.ts` — endpoint functions
- `packages/api/src/__tests__/services/social/get-followers.test.ts` — tests

## Files to modify

None.

## Implementation

### `get-followers.ts`

```typescript
import { Effect, pipe } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { UserNotFoundError, UserNotPublicError } from '@lily/shared'
import { parsePaginationParams, paginate } from '@lily/api/services/helpers/pagination'

// Own followers
export const getFollowers = (params: { page?: string; limit?: string }) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const { page, limit } = parsePaginationParams(params)

    const { items, total } = yield* followRepo.getFollowers({
      userId: currentUserId,
      currentUserId,
      page,
      limit,
    })

    return paginate(items, total, page, limit)
  }).pipe(Effect.withSpan('SocialService.getFollowers'))

// Another user's followers
export const getUserFollowers = (
  targetUserId: string,
  params: { page?: string; limit?: string }
) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const userRepo = yield* UserRepository
    const { page, limit } = parsePaginationParams(params)

    // Target must exist
    const targetUser = yield* userRepo.findById(targetUserId)
    if (!targetUser) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    // Target must have public profile
    if (!targetUser.publicProfile) {
      return yield* Effect.fail(new UserNotPublicError({ userId: targetUserId }))
    }

    const { items, total } = yield* followRepo.getFollowers({
      userId: targetUserId,
      currentUserId,
      page,
      limit,
    })

    return paginate(items, total, page, limit)
  }).pipe(Effect.withSpan('SocialService.getUserFollowers'))
```

### Business rules

1. Own followers: no visibility check needed (you always see your own followers)
2. Other user's followers: target must exist + have `publicProfile = true`
3. Each item includes `isFollowing` so the UI can show follow/unfollow buttons
4. Paginated response using standard `PaginatedResponse` pattern

## Reference

- Copy pagination pattern from `packages/api/src/services/plants/endpoints/find-plants.ts`

## Tests

### `get-followers.test.ts`

```
describe('getFollowers', () => {
  it('should return paginated list of followers')
  it('should return empty list when no followers')
  it('should include isFollowing status for each follower')
})

describe('getUserFollowers', () => {
  it('should return followers of a public user')
  it('should fail with UserNotFoundError for non-existent user')
  it('should fail with UserNotPublicError for private user')
})
```

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run test get-followers
```

## Commit

```
feat(social): add getFollowers and getUserFollowers endpoints
```
