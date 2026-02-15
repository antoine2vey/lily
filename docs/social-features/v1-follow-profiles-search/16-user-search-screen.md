# Task 16 — User Search Screen

[x] DONE

## Context

Depends on: Task 15 (social hooks).
Creates the UserSearchScreen where users can search for and discover other users.

## Files to create

- `packages/app/src/screens/user-search/index.ts` — barrel export
- `packages/app/src/screens/user-search/UserSearchScreen.tsx` — main screen
- `packages/app/src/screens/user-search/components/UserCardItem.tsx` — user card list item
- `packages/app/src/screens/user-search/components/UserSearchSkeleton.tsx` — loading skeleton
- `packages/app/app/(app)/user-search.tsx` — route file

## Files to modify

None (navigation added in Task 19 from profile screen).

## Implementation

### Route file: `app/(app)/user-search.tsx`

```typescript
import { UserSearchScreen } from '@lily/app/screens/user-search'

export default function UserSearch() {
  return <UserSearchScreen />
}
```

### `UserSearchScreen.tsx`

```tsx
import { useState, useCallback } from 'react'
import { View, TextInput, FlatList, Text } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSearchUsers } from '@lily/app/hooks/useSearchUsers'
import { useSuggestedUsers } from '@lily/app/hooks/useSuggestedUsers'
import { useDelayedLoading } from '@lily/app/hooks/useDelayedLoading'
import { UserCardItem } from './components/UserCardItem'
import { UserSearchSkeleton } from './components/UserSearchSkeleton'
import { pipe, Match } from 'effect'

export function UserSearchScreen() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)

  const isSearching = debouncedQuery.trim().length > 0
  const {
    data: searchResults,
    isLoading: isSearchLoading,
  } = useSearchUsers(debouncedQuery, isSearching)

  const {
    data: suggested,
    isLoading: isSuggestedLoading,
  } = useSuggestedUsers()

  // Show search results when searching, otherwise show suggestions
  // Use delayed loading for skeleton
  // Render FlatList with UserCardItem
  // Search input at top with magnifying glass icon
  // "Suggested for you" header when showing suggestions
  // Empty state when no results found
}
```

### UI structure

1. **Search bar** at top with TextInput + search icon
2. **When no query**: Show "Suggested for you" section with `useSuggestedUsers` results
3. **When typing**: Show search results from `useSearchUsers` with debounce
4. **Each item**: `UserCardItem` showing avatar, name, username, plant count, follow/unfollow button
5. **Empty state**: "No users found" when search returns empty
6. **Loading state**: `UserSearchSkeleton` with shimmer cards

### `UserCardItem.tsx`

```tsx
// Pressable row: avatar (40px circle) | name + username + plantCount | Follow/Unfollow button
// Follow button: bg-primary rounded-xl px-4 py-2
// Unfollow button: bg-transparent border border-primary rounded-xl px-4 py-2
// On press avatar/name: router.push(`/public-profile/${user.id}`)
// On press follow: call useFollowUser mutation
// On press unfollow: call useUnfollowUser mutation
```

### Skeleton

Mirror the card layout with SkeletonCircle (40px) + SkeletonBox for text lines.

## Reference

- Copy screen structure from `packages/app/src/screens/plants/PlantsScreen.tsx` (FlatList pattern)
- Copy skeleton from `packages/app/src/screens/home/components/` (shimmer pattern)
- Follow NativeWind styling patterns from `packages/app/CLAUDE.md`

## Tests

No automated tests for screens — verified manually in Task 20 smoke test.

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
feat(social): add UserSearchScreen with search and suggested users
```
