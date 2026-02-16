# Task 20 — V1 Smoke Test

[x] DONE

## Context

Depends on: All V1 tasks (01–19).
Final verification that the entire V1 social feature set works end-to-end.

## Files to create

None.

## Files to modify

None.

## Implementation

This is a verification task, not an implementation task. Run through the following checklist.

### Backend verification

```bash
# 1. All tests pass
cd packages/api && bun run test

# 2. Typecheck passes
cd packages/api && bun run typecheck
cd packages/shared && bun run typecheck
cd packages/db && bun run typecheck

# 3. Migration applies cleanly
cd packages/db && bun drizzle-kit push

# 4. API starts without errors
cd packages/api && bun run dev
```

### API endpoint smoke tests

Using curl or httpie against local dev server (port 3000):

```bash
# Auth: get a bearer token first
TOKEN="..."

# 1. Search users
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/social/search?query=test"

# 2. Follow a user
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/social/follow/{userId}"

# 3. Get followers
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/social/followers"

# 4. Get following
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/social/following"

# 5. Get public profile
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/social/profile/{userId}"

# 6. Get suggested users
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/social/suggested"

# 7. Send nudge
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targetUserId": "{userId}"}' \
  "http://localhost:3000/api/social/nudge"

# 8. Unfollow
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/social/follow/{userId}"
```

### App verification

```bash
# 1. Typecheck
cd packages/app && bun run typecheck

# 2. Start dev server
cd packages/app && bun run start
```

Manual checks in the app:
- [ ] Profile screen shows follower/following counts
- [ ] "Find Friends" button navigates to search screen
- [ ] Search returns results and debounces correctly
- [ ] Suggested users section appears when no search query
- [ ] Tapping a user navigates to public profile
- [ ] Follow/Unfollow buttons work and update counts
- [ ] Followers/Following screens show correct lists
- [ ] Nudge button sends notification (check server logs)
- [ ] Private profiles show appropriate error
- [ ] Loading skeletons appear on slow connections

### Edge cases to verify

- [ ] Cannot follow yourself
- [ ] Cannot follow a private profile
- [ ] Cannot double-follow
- [ ] Nudge rate limit works (try nudging same user twice)
- [ ] Empty states render correctly
- [ ] Pagination works if > 20 items

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run test
cd packages/api && bun run typecheck
cd packages/shared && bun run typecheck
cd packages/app && bun run typecheck
```

## Commit

No commit for this task — it's a verification checkpoint.
