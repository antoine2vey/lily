# Task 15 — App Social Hooks

[x] DONE

## Context

Depends on: Task 02 (shared types), Task 12 (API wired and available).
Creates all React Query hooks for social features. All app screen tasks (16–19) depend on this.

## Files to create

- `packages/app/src/hooks/useSearchUsers.ts` — search query hook
- `packages/app/src/hooks/usePublicProfile.ts` — public profile query hook
- `packages/app/src/hooks/useFollowers.ts` — followers list query hook
- `packages/app/src/hooks/useFollowing.ts` — following list query hook
- `packages/app/src/hooks/useSuggestedUsers.ts` — suggested users query hook
- `packages/app/src/hooks/useFollowUser.ts` — follow mutation hook
- `packages/app/src/hooks/useUnfollowUser.ts` — unfollow mutation hook
- `packages/app/src/hooks/useSendNudge.ts` — nudge mutation hook

## Files to modify

- `packages/app/src/utils/query-keys.ts` — add `social` domain keys
- `packages/app/src/utils/client.tsx` — add social error types to `ApiFailure` union (if needed)

## Implementation

### Query keys (`query-keys.ts`)

Add to `queryKeys`:
```typescript
social: {
  all: ['social'] as const,
  search: (query: string) => [...queryKeys.social.all, 'searchUsers', query] as const,
  profile: (userId: string) => [...queryKeys.social.all, 'getPublicProfile', userId] as const,
  followers: (userId?: string) => [...queryKeys.social.all, 'getFollowers', userId] as const,
  following: (userId?: string) => [...queryKeys.social.all, 'getFollowing', userId] as const,
  suggested: () => [...queryKeys.social.all, 'getSuggestedUsers'] as const,
},
```

Add to `invalidateKeys`:
```typescript
social: queryKeys.social.all,
```

### Hook patterns

#### `useSearchUsers.ts`

```typescript
import { useEffectQuery } from '@lily/app/utils/client'
import { queryKeys } from '@lily/app/utils/query-keys'

export function useSearchUsers(query: string, enabled = true) {
  return useEffectQuery(
    'social',
    'searchUsers',
    {
      urlParams: { query, page: '1', limit: '20' },
    },
    {
      enabled: enabled && query.trim().length > 0,
      queryKey: queryKeys.social.search(query),
    }
  )
}
```

#### `usePublicProfile.ts`

```typescript
export function usePublicProfile(userId: string) {
  return useEffectQuery(
    'social',
    'getPublicProfile',
    { path: { userId } },
    { queryKey: queryKeys.social.profile(userId) }
  )
}
```

#### `useFollowers.ts`

```typescript
export function useFollowers(userId?: string) {
  // If no userId, gets own followers; otherwise gets target's followers
  const endpoint = userId ? 'getUserFollowers' : 'getFollowers'
  const params = userId
    ? { path: { userId }, urlParams: { page: '1', limit: '20' } }
    : { urlParams: { page: '1', limit: '20' } }

  return useEffectQuery('social', endpoint, params, {
    queryKey: queryKeys.social.followers(userId),
  })
}
```

#### `useFollowing.ts`

```typescript
export function useFollowing(userId?: string) {
  const endpoint = userId ? 'getUserFollowing' : 'getFollowing'
  const params = userId
    ? { path: { userId }, urlParams: { page: '1', limit: '20' } }
    : { urlParams: { page: '1', limit: '20' } }

  return useEffectQuery('social', endpoint, params, {
    queryKey: queryKeys.social.following(userId),
  })
}
```

#### `useSuggestedUsers.ts`

```typescript
export function useSuggestedUsers() {
  return useEffectQuery('social', 'getSuggestedUsers', {}, {
    queryKey: queryKeys.social.suggested(),
    staleTime: StaleTime.default,
  })
}
```

#### `useFollowUser.ts`

```typescript
export function useFollowUser() {
  const queryClient = useQueryClient()
  return useEffectMutation('social', 'followUser', {
    onSuccess: () => {
      // Invalidate follower/following counts + lists
      queryClient.invalidateQueries({ queryKey: queryKeys.social.all })
    },
  })
}
```

#### `useUnfollowUser.ts`

```typescript
export function useUnfollowUser() {
  const queryClient = useQueryClient()
  return useEffectMutation('social', 'unfollowUser', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.social.all })
    },
  })
}
```

#### `useSendNudge.ts`

```typescript
export function useSendNudge() {
  return useEffectMutation('social', 'sendNudge', {
    onError: (error) => {
      // Handle NudgeRateLimitError with user-friendly toast
    },
  })
}
```

### Error handling

Social error types (`AlreadyFollowingError`, `NudgeRateLimitError`, etc.) will be automatically included in the `ApiFailure` union via the generated API client types. No manual changes needed if the client is auto-generated from the API.

If manual, add to `ApiFailure` type in `client.tsx`:
```typescript
| AlreadyFollowingError
| NotFollowingError
| CannotFollowSelfError
| UserNotPublicError
| NudgeRateLimitError
| NudgeNotAllowedError
```

## Reference

- Copy hook pattern from `packages/app/src/hooks/usePlants.ts`
- Copy mutation pattern from `packages/app/src/hooks/useCreatePlant.ts`
- Copy query keys pattern from `packages/app/src/utils/query-keys.ts`

## Tests

No tests for hooks — verified by integration with screens + typecheck.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/app && bun run typecheck
```

## Commit

```
feat(social): add all social React Query hooks and query keys
```
