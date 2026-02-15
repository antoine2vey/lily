# Task 08 — Get Following Endpoint

[x] DONE

## Context

Depends on: Task 03 (FollowRepository), Task 04 (SocialApi definition).
Implements two endpoints:
- `GET /api/social/following` — current user's following list
- `GET /api/social/users/:userId/following` — another user's following list

## Files to create

- `packages/api/src/services/social/endpoints/get-following.ts` — endpoint functions
- `packages/api/src/__tests__/services/social/get-following.test.ts` — tests

## Files to modify

None.

## Implementation

### `get-following.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { UserNotFoundError, UserNotPublicError } from '@lily/shared'
import { parsePaginationParams, paginate } from '@lily/api/services/helpers/pagination'

// Own following list
export const getFollowing = (params: { page?: string; limit?: string }) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const { page, limit } = parsePaginationParams(params)

    const { items, total } = yield* followRepo.getFollowing({
      userId: currentUserId,
      currentUserId,
      page,
      limit,
    })

    return paginate(items, total, page, limit)
  }).pipe(Effect.withSpan('SocialService.getFollowing'))

// Another user's following list
export const getUserFollowing = (
  targetUserId: string,
  params: { page?: string; limit?: string }
) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const userRepo = yield* UserRepository
    const { page, limit } = parsePaginationParams(params)

    const targetUser = yield* userRepo.findById(targetUserId)
    if (!targetUser) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    if (!targetUser.publicProfile) {
      return yield* Effect.fail(new UserNotPublicError({ userId: targetUserId }))
    }

    const { items, total } = yield* followRepo.getFollowing({
      userId: targetUserId,
      currentUserId,
      page,
      limit,
    })

    return paginate(items, total, page, limit)
  }).pipe(Effect.withSpan('SocialService.getUserFollowing'))
```

### Business rules

Same as Task 07 but for the following list:
1. Own following: always accessible
2. Other user's following: requires public profile
3. Paginated, includes `isFollowing` for each user in the list

## Reference

- Same patterns as Task 07 (`get-followers.ts`)

## Tests

### `get-following.test.ts`

```
describe('getFollowing', () => {
  it('should return paginated list of users being followed')
  it('should return empty list when not following anyone')
  it('should include isFollowing status (always true for own list)')
})

describe('getUserFollowing', () => {
  it('should return following list of a public user')
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
cd packages/api && bun run test get-following
```

## Commit

```
feat(social): add getFollowing and getUserFollowing endpoints
```
