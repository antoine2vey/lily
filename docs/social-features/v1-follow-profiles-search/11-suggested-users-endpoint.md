# Task 11 — Suggested Users Endpoint

[x] DONE

## Context

Depends on: Task 03 (FollowRepository), Task 04 (SocialApi definition).
Implements `GET /api/social/suggested` — users followed by people you follow (friends-of-friends).

## Files to create

- `packages/api/src/services/social/endpoints/get-suggested-users.ts` — endpoint function
- `packages/api/src/__tests__/services/social/get-suggested-users.test.ts` — tests

## Files to modify

None.

## Implementation

### `get-suggested-users.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { FollowRepository } from '@lily/api/repositories/follow.repository'

export const getSuggestedUsers = Effect.gen(function* () {
  const { id: currentUserId } = yield* CurrentUser
  const followRepo = yield* FollowRepository

  const suggestions = yield* followRepo.getSuggestedUsers({
    currentUserId,
    limit: 10,
  })

  return suggestions
}).pipe(Effect.withSpan('SocialService.getSuggestedUsers'))
```

### Business rules

1. Returns up to 10 suggested users
2. Algorithm: "friends of friends" — users followed by people you follow
3. Excludes:
   - Users you already follow
   - Yourself
   - Users with `publicProfile = false`
   - Users with `status != 'active'`
4. Ordered by number of mutual connections (most connected first)
5. If user follows nobody, return empty array (no suggestions)
6. Not paginated — fixed limit of 10

### Repository SQL

```sql
SELECT DISTINCT
  u.id, u.name, u.username, u.image,
  (SELECT count(*) FROM plants WHERE plants.user_id = u.id) AS plant_count,
  false AS is_following,
  COUNT(f2.follower_id) AS mutual_count
FROM user_follows f1
JOIN user_follows f2 ON f1.following_id = f2.follower_id
JOIN users u ON f2.following_id = u.id
WHERE f1.follower_id = :currentUserId
  AND u.id != :currentUserId
  AND u.public_profile = true
  AND u.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM user_follows
    WHERE follower_id = :currentUserId AND following_id = u.id
  )
GROUP BY u.id, u.name, u.username, u.image
ORDER BY mutual_count DESC
LIMIT :limit
```

Note: `is_following` is always `false` since we exclude already-followed users.

## Reference

- Copy endpoint pattern from `packages/api/src/services/plants/endpoints/find-plants.ts`

## Tests

### `get-suggested-users.test.ts`

```
describe('getSuggestedUsers', () => {
  it('should return friends-of-friends suggestions')
  it('should exclude already-followed users')
  it('should exclude current user')
  it('should exclude private profiles')
  it('should return empty array when user follows nobody')
  it('should limit results to 10')
  it('should order by number of mutual connections')
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
cd packages/api && bun run test get-suggested-users
```

## Commit

```
feat(social): add getSuggestedUsers endpoint with friends-of-friends algorithm
```
