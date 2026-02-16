# Task 19 — Profile Screen Updates

[x] DONE

## Context

Depends on: Tasks 15–18 (hooks + all social screens exist).
Updates the existing ProfileScreen to show follower/following counts and add navigation to social features.

## Files to create

None.

## Files to modify

- `packages/app/src/screens/profile/ProfileScreen.tsx` — add social stats + menu items
- `packages/app/src/screens/profile/components/ProfileHeader.tsx` — add follower/following counts below avatar

## Implementation

### ProfileHeader updates

Add below the existing user name/bio section:

```tsx
// Social stats row (tappable)
<View className="flex-row justify-center gap-8 mt-4">
  <Pressable
    onPress={() => router.push('/followers/me')}
    className="items-center"
  >
    <Text
      className="text-lg text-text-primary"
      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
    >
      {followerCount}
    </Text>
    <Text className="text-xs text-text-secondary">Followers</Text>
  </Pressable>

  <Pressable
    onPress={() => router.push('/following/me')}
    className="items-center"
  >
    <Text
      className="text-lg text-text-primary"
      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
    >
      {followingCount}
    </Text>
    <Text className="text-xs text-text-secondary">Following</Text>
  </Pressable>
</View>
```

### ProfileScreen updates

Add a "Find Friends" menu item in the profile menu section:

```tsx
<ProfileMenuItem
  icon="search"
  label="Find Friends"
  onPress={() => router.push('/user-search')}
/>
```

Position it after the existing menu items (Edit Profile, Subscription, etc.) but in a "Social" section.

### Data fetching

The ProfileScreen needs follower/following counts. Two options:
1. **Add a dedicated hook** — `useFollowCounts()` that returns `{ followerCount, followingCount }`
2. **Reuse existing hooks** — `useFollowers()` and `useFollowing()` already return `total`

Recommended: Create a lightweight `useSocialStats` hook:

```typescript
// packages/app/src/hooks/useSocialStats.ts
export function useSocialStats() {
  const { data: followers } = useFollowers()
  const { data: following } = useFollowing()

  return {
    followerCount: followers?.total ?? 0,
    followingCount: following?.total ?? 0,
  }
}
```

Or better: add a dedicated `GET /api/social/stats` endpoint that returns just the counts to avoid fetching full lists. This can be a follow-up optimization.

### Navigation routes

- "Find Friends" → `/user-search`
- Follower count tap → `/followers/me` (own followers, `me` is a sentinel or use no param)
- Following count tap → `/following/me` (own following)

**Note on route params**: Since own lists don't need a userId, the route files should handle `me` or missing userId:
```typescript
// followers/[userId].tsx
const { userId } = useLocalSearchParams<{ userId: string }>()
const actualUserId = userId === 'me' ? undefined : userId
return <FollowersScreen userId={actualUserId} />
```

## Reference

- Existing `packages/app/src/screens/profile/ProfileScreen.tsx`
- Existing `packages/app/src/screens/profile/components/ProfileHeader.tsx`
- Copy MenuItem pattern from `packages/app/src/screens/profile/components/ProfileMenuItem.tsx`

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
feat(social): add follower/following counts and Find Friends to profile screen
```
