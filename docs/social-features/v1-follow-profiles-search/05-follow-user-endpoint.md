# Task 05 — Follow User Endpoint

[x] DONE

## Context

Depends on: Task 03 (FollowRepository), Task 04 (SocialApi definition).
Implements the `followUser` endpoint: `POST /api/social/follow/:userId`.

## Files to create

- `packages/api/src/services/social/endpoints/follow-user.ts` — endpoint function
- `packages/api/src/__tests__/services/social/follow-user.test.ts` — tests

## Files to modify

None (service wiring happens in Task 12).

## Implementation

### `follow-user.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  AlreadyFollowingError,
  CannotFollowSelfError,
  UserNotPublicError,
} from '@lily/shared'
import { UserNotFoundError } from '@lily/shared'

export const followUser = (targetUserId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const userRepo = yield* UserRepository

    // Cannot follow self
    if (currentUserId === targetUserId) {
      return yield* Effect.fail(new CannotFollowSelfError())
    }

    // Target user must exist
    const targetUser = yield* userRepo.findById(targetUserId)
    if (!targetUser) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    // Target must have public profile
    if (!targetUser.publicProfile) {
      return yield* Effect.fail(new UserNotPublicError({ userId: targetUserId }))
    }

    // Check if already following
    const alreadyFollowing = yield* followRepo.isFollowing(currentUserId, targetUserId)
    if (alreadyFollowing) {
      return yield* Effect.fail(new AlreadyFollowingError({ targetUserId }))
    }

    // Create follow relationship
    yield* followRepo.follow(currentUserId, targetUserId)

    return { success: true }
  }).pipe(Effect.withSpan('SocialService.followUser'))
```

### Business rules

1. Cannot follow yourself → 400
2. Target user must exist → 404
3. Target must have `publicProfile = true` → 403
4. Cannot follow someone you already follow → 409
5. On success → insert row, return `{ success: true }` with 201

## Reference

- Copy endpoint pattern from `packages/api/src/services/plants/endpoints/create-plant.ts`

## Tests

### `follow-user.test.ts`

```typescript
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { followUser } from '@lily/api/services/social/endpoints/follow-user'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('followUser', () => {
  // Setup: mock user with publicProfile=true, mock follow repo empty
  // Test cases:

  it('should follow a public user successfully')
  it('should fail with CannotFollowSelfError when following self')
  it('should fail with UserNotFoundError when target does not exist')
  it('should fail with UserNotPublicError when target profile is private')
  it('should fail with AlreadyFollowingError when already following')
})
```

Mock setup: create `createMockFollowRepository` that accepts a list of existing follows and provides in-memory follow/unfollow/isFollowing behavior.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run test follow-user
```

## Commit

```
feat(social): add followUser endpoint with validation
```
