# Task 17 — Public Profile Screen

[x] DONE

## Context

Depends on: Task 15 (social hooks).
Creates the PublicProfileScreen to view another user's profile, follow/unfollow them, and see their stats.

## Files to create

- `packages/app/src/screens/public-profile/index.ts` — barrel export
- `packages/app/src/screens/public-profile/PublicProfileScreen.tsx` — main screen
- `packages/app/src/screens/public-profile/components/ProfileStats.tsx` — stats row
- `packages/app/src/screens/public-profile/components/PublicProfileSkeleton.tsx` — loading skeleton
- `packages/app/app/(app)/public-profile/[userId].tsx` — route file

## Files to modify

None.

## Implementation

### Route file: `app/(app)/public-profile/[userId].tsx`

```typescript
import { useLocalSearchParams } from 'expo-router'
import { PublicProfileScreen } from '@lily/app/screens/public-profile'

export default function PublicProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  return <PublicProfileScreen userId={userId} />
}
```

### `PublicProfileScreen.tsx`

```tsx
import { View, Text, ScrollView, Pressable } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { router } from 'expo-router'
import { usePublicProfile } from '@lily/app/hooks/usePublicProfile'
import { useFollowUser } from '@lily/app/hooks/useFollowUser'
import { useUnfollowUser } from '@lily/app/hooks/useUnfollowUser'
import { useSendNudge } from '@lily/app/hooks/useSendNudge'
import { useDelayedLoading } from '@lily/app/hooks/useDelayedLoading'
import { ProfileStats } from './components/ProfileStats'
import { PublicProfileSkeleton } from './components/PublicProfileSkeleton'
import { pipe, Match } from 'effect'

interface PublicProfileScreenProps {
  userId: string
}

export function PublicProfileScreen({ userId }: PublicProfileScreenProps) {
  const { data: profile, isLoading } = usePublicProfile(userId)
  const { mutate: follow, isPending: isFollowing } = useFollowUser()
  const { mutate: unfollow, isPending: isUnfollowing } = useUnfollowUser()
  const { mutate: nudge, isPending: isNudging } = useSendNudge()

  // Layout:
  // 1. Avatar (large, 80px circle)
  // 2. Name + username
  // 3. Bio (if set)
  // 4. Stats row: Plants | Followers | Following (tappable counts)
  // 5. Follow/Unfollow button (full width)
  // 6. Nudge button (if following, subtle secondary style)
  // 7. "Member since" date
}
```

### UI structure

1. **Header area**: Large avatar (80px), name, username below
2. **Bio**: If set, show below name in `text-text-secondary`
3. **Stats row** (`ProfileStats`): Three columns — plant count, follower count (tappable → followers screen), following count (tappable → following screen)
4. **Action buttons**:
   - If not following: Primary "Follow" button (`bg-primary rounded-xl py-4`)
   - If following: Secondary "Following" button with checkmark + "Nudge" button
   - Nudge only visible when following
5. **Growth data**: If `shareGrowthData` is true, show a section with plant growth stats (placeholder for future)
6. **Member since**: Footer with join date

### Navigation from stats

- Tap follower count → `router.push(\`/followers/${userId}\`)`
- Tap following count → `router.push(\`/following/${userId}\`)`

### Error states

- 404 (user not found): "User not found" screen
- 403 (private profile): "This profile is private" screen

## Reference

- Copy screen layout from `packages/app/src/screens/profile/ProfileScreen.tsx`
- Copy avatar + header from `packages/app/src/screens/profile/components/ProfileHeader.tsx`
- Copy stats grid from `packages/app/src/screens/profile/components/StatsCard.tsx`

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
feat(social): add PublicProfileScreen with follow/unfollow and nudge
```
