# Task 06 — Unfollow User Endpoint

[x] DONE

## Context

Depends on: Task 03 (FollowRepository), Task 04 (SocialApi definition).
Implements the `unfollowUser` endpoint: `DELETE /api/social/follow/:userId`.

## Files to create

- `packages/api/src/services/social/endpoints/unfollow-user.ts` — endpoint function
- `packages/api/src/__tests__/services/social/unfollow-user.test.ts` — tests

## Files to modify

None.

## Implementation

### `unfollow-user.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CannotFollowSelfError, NotFollowingError } from '@lily/shared'
import { UserNotFoundError } from '@lily/shared'

export const unfollowUser = (targetUserId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const userRepo = yield* UserRepository

    // Cannot unfollow self
    if (currentUserId === targetUserId) {
      return yield* Effect.fail(new CannotFollowSelfError())
    }

    // Target user must exist
    const targetUser = yield* userRepo.findById(targetUserId)
    if (!targetUser) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    // Must be currently following
    const isFollowing = yield* followRepo.isFollowing(currentUserId, targetUserId)
    if (!isFollowing) {
      return yield* Effect.fail(new NotFollowingError({ targetUserId }))
    }

    // Delete follow relationship
    yield* followRepo.unfollow(currentUserId, targetUserId)

    return { success: true }
  }).pipe(Effect.withSpan('SocialService.unfollowUser'))
```

### Business rules

1. Cannot unfollow yourself → 400
2. Target user must exist → 404
3. Must be currently following → 404 (NotFollowingError)
4. On success → delete row, return `{ success: true }` with 200

## Reference

- Copy pattern from `packages/api/src/services/plants/endpoints/delete-plant.ts`

## Tests

### `unfollow-user.test.ts`

```
describe('unfollowUser', () => {
  it('should unfollow a user successfully')
  it('should fail with CannotFollowSelfError when unfollowing self')
  it('should fail with UserNotFoundError when target does not exist')
  it('should fail with NotFollowingError when not currently following')
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
cd packages/api && bun run test unfollow-user
```

## Commit

```
feat(social): add unfollowUser endpoint with validation
```
