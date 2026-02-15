# Task 18 — Followers & Following Screens

[x] DONE

## Context

Depends on: Task 15 (social hooks), Task 16 (UserCardItem component).
Creates the FollowersScreen and FollowingScreen to display paginated lists.

## Files to create

- `packages/app/src/screens/followers/index.ts` — barrel export
- `packages/app/src/screens/followers/FollowersScreen.tsx` — followers list
- `packages/app/src/screens/following/index.ts` — barrel export
- `packages/app/src/screens/following/FollowingScreen.tsx` — following list
- `packages/app/app/(app)/followers/[userId].tsx` — route file (optional userId)
- `packages/app/app/(app)/following/[userId].tsx` — route file (optional userId)

## Files to modify

None.

## Implementation

### Route files

```typescript
// app/(app)/followers/[userId].tsx
import { useLocalSearchParams } from 'expo-router'
import { FollowersScreen } from '@lily/app/screens/followers'

export default function Followers() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  return <FollowersScreen userId={userId} />
}
```

Same pattern for `following/[userId].tsx`.

### `FollowersScreen.tsx`

```tsx
import { FlatList, View, Text } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useFollowers } from '@lily/app/hooks/useFollowers'
import { useDelayedLoading } from '@lily/app/hooks/useDelayedLoading'
import { UserCardItem } from '@lily/app/screens/user-search/components/UserCardItem'

interface FollowersScreenProps {
  userId?: string // undefined = own followers
}

export function FollowersScreen({ userId }: FollowersScreenProps) {
  const { data, isLoading } = useFollowers(userId)
  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)

  // FlatList rendering UserCardItem for each follower
  // Empty state: "No followers yet"
  // Title: "Followers" in header
}
```

### `FollowingScreen.tsx`

Same structure as FollowersScreen but uses `useFollowing(userId)`:

```tsx
export function FollowingScreen({ userId }: FollowingScreenProps) {
  const { data, isLoading } = useFollowing(userId)
  // Same FlatList + skeleton + empty state pattern
  // Empty state: "Not following anyone yet"
  // Title: "Following" in header
}
```

### Shared component

Both screens reuse `UserCardItem` from Task 16. The component shows:
- Avatar, name, username, plant count
- Follow/Unfollow button
- Tap to navigate to public profile

### Header titles

- Own followers: "Followers"
- Other user's followers: "{name}'s Followers"
- Own following: "Following"
- Other user's following: "{name}'s Following"

Use `useNavigation` to set the header title dynamically.

### Pagination

For now, load first page only. If needed later, add infinite scroll with `onEndReached` + cursor-based pagination.

## Reference

- Reuse `UserCardItem` from `packages/app/src/screens/user-search/components/UserCardItem.tsx`
- Copy FlatList pattern from `packages/app/src/screens/plants/PlantsScreen.tsx`
- Copy route param pattern from `packages/app/app/(app)/plant/[plantId]/index.tsx`

## Tests

No automated tests — verified in Task 20 smoke test.

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
feat(social): add FollowersScreen and FollowingScreen with user lists
```
