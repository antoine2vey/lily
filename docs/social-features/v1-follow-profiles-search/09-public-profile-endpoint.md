# Task 09 — Public Profile Endpoint

[x] DONE

## Context

Depends on: Task 03 (FollowRepository), Task 04 (SocialApi definition).
Implements `GET /api/social/profile/:userId` — view another user's public profile.

## Files to create

- `packages/api/src/services/social/endpoints/get-public-profile.ts` — endpoint function
- `packages/api/src/__tests__/services/social/get-public-profile.test.ts` — tests

## Files to modify

None.

## Implementation

### `get-public-profile.ts`

```typescript
import { Effect, Option, pipe } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserNotFoundError, UserNotPublicError } from '@lily/shared'

export const getPublicProfile = (targetUserId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository

    const profile = yield* followRepo.getPublicProfile({
      targetUserId,
      currentUserId,
    })

    if (!profile) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    if (!profile.publicProfile) {
      return yield* Effect.fail(new UserNotPublicError({ userId: targetUserId }))
    }

    // Return public-facing profile (exclude internal publicProfile flag)
    return {
      id: profile.id,
      name: profile.name,
      username: profile.username,
      image: profile.image,
      bio: profile.bio,
      plantCount: profile.plantCount,
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
      isFollowing: profile.isFollowing,
      shareGrowthData: profile.shareGrowthData,
      createdAt: profile.createdAt,
    }
  }).pipe(Effect.withSpan('SocialService.getPublicProfile'))
```

### Business rules

1. Target user must exist → 404
2. Target must have `publicProfile = true` → 403
3. Response includes:
   - Basic info: name, username, image, bio, createdAt
   - Counts: plantCount, followerCount, followingCount
   - Relationship: isFollowing (whether current user follows them)
   - Privacy: shareGrowthData (if true, app can show growth stats)
4. If viewing your own profile via this endpoint, it still works (isFollowing = false for self)

### Repository query

The `getPublicProfile` method in FollowRepository should execute a single query:

```sql
SELECT
  u.id, u.name, u.username, u.image, u.bio,
  u.public_profile, u.share_growth_data, u.created_at,
  (SELECT count(*) FROM plants WHERE plants.user_id = u.id) AS plant_count,
  (SELECT count(*) FROM user_follows WHERE following_id = u.id) AS follower_count,
  (SELECT count(*) FROM user_follows WHERE follower_id = u.id) AS following_count,
  EXISTS (
    SELECT 1 FROM user_follows
    WHERE follower_id = :currentUserId AND following_id = u.id
  ) AS is_following
FROM users u
WHERE u.id = :targetUserId
```

## Reference

- Copy endpoint pattern from `packages/api/src/services/plants/endpoints/find-plant-by-id.ts`

## Tests

### `get-public-profile.test.ts`

```
describe('getPublicProfile', () => {
  it('should return public profile with counts for a public user')
  it('should include isFollowing=true when currently following')
  it('should include isFollowing=false when not following')
  it('should fail with UserNotFoundError for non-existent user')
  it('should fail with UserNotPublicError for private user')
  it('should include shareGrowthData flag')
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
cd packages/api && bun run test get-public-profile
```

## Commit

```
feat(social): add getPublicProfile endpoint with counts and follow status
```
