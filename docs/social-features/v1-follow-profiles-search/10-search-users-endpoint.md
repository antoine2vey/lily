# Task 10 — Search Users Endpoint

[x] DONE

## Context

Depends on: Task 03 (FollowRepository), Task 04 (SocialApi definition).
Implements `GET /api/social/search?query=...` — search for users by name or username.

## Files to create

- `packages/api/src/services/social/endpoints/search-users.ts` — endpoint function
- `packages/api/src/__tests__/services/social/search-users.test.ts` — tests

## Files to modify

None.

## Implementation

### `search-users.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { parsePaginationParams, paginate } from '@lily/api/services/helpers/pagination'

export const searchUsers = (params: {
  query: string
  page?: string
  limit?: string
}) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const { page, limit } = parsePaginationParams(params)

    // Trim and validate query
    const trimmedQuery = params.query.trim()

    // Empty query returns empty results
    if (trimmedQuery.length === 0) {
      return paginate([], 0, page, limit)
    }

    const { items, total } = yield* followRepo.searchUsers({
      query: trimmedQuery,
      currentUserId,
      page,
      limit,
    })

    return paginate(items, total, page, limit)
  }).pipe(Effect.withSpan('SocialService.searchUsers'))
```

### Business rules

1. Search is case-insensitive (ILIKE in PostgreSQL)
2. Matches against both `name` and `username` fields
3. Only returns users with `publicProfile = true`
4. Excludes the current user from results
5. Empty/whitespace-only query returns empty results (no error)
6. Results include `isFollowing` for each user
7. Paginated using standard pagination

### Repository SQL

```sql
SELECT
  u.id, u.name, u.username, u.image,
  (SELECT count(*) FROM plants WHERE plants.user_id = u.id) AS plant_count,
  EXISTS (
    SELECT 1 FROM user_follows
    WHERE follower_id = :currentUserId AND following_id = u.id
  ) AS is_following
FROM users u
WHERE (u.name ILIKE '%' || :query || '%' OR u.username ILIKE '%' || :query || '%')
  AND u.public_profile = true
  AND u.id != :currentUserId
  AND u.status = 'active'
ORDER BY
  -- Exact username match first, then prefix match, then contains
  CASE WHEN u.username ILIKE :query THEN 0
       WHEN u.username ILIKE :query || '%' THEN 1
       WHEN u.name ILIKE :query THEN 2
       WHEN u.name ILIKE :query || '%' THEN 3
       ELSE 4
  END,
  u.name ASC
OFFSET :offset LIMIT :limit
```

### Security considerations

- The `query` parameter is parameterized (never interpolated into SQL)
- ILIKE with user input is safe when parameterized via Drizzle's `sql` template
- Rate limiting via standard API rate limiter is sufficient

## Reference

- Copy pagination from `packages/api/src/services/plants/endpoints/find-plants.ts`

## Tests

### `search-users.test.ts`

```
describe('searchUsers', () => {
  it('should find users by name (case-insensitive)')
  it('should find users by username (case-insensitive)')
  it('should exclude current user from results')
  it('should exclude users with private profiles')
  it('should return empty results for empty query')
  it('should return paginated results')
  it('should include isFollowing status for each result')
  it('should exclude suspended/banned users')
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
cd packages/api && bun run test search-users
```

## Commit

```
feat(social): add searchUsers endpoint with name and username matching
```
