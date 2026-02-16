# Task 21 — Profile Delegation Entry

[ ] DONE

## Context

Depends on: Task 19 (DelegationListScreen exists to navigate to).
Adds a "Delegations" menu item to the profile screen for easy access to the delegation list.

## Files to create

None.

## Files to modify

- `packages/app/src/screens/profile/ProfileScreen.tsx` — add "Delegations" menu item

## Implementation

### Add menu item

In the profile screen's menu section, add a "Delegations" item:

```tsx
<ProfileMenuItem
  icon="repeat"  // or "calendar" or "people" — pick an appropriate icon
  label="Delegations"
  onPress={() => router.push('/delegations')}
  badge={activeDelegationCount > 0 ? activeDelegationCount.toString() : undefined}
/>
```

### Position

Place it in the same section as "Find Friends" (added in V1 Task 19), under a "Social" or "Community" section header:

```tsx
{/* Social section */}
<Text className="text-[11px] text-text-muted uppercase tracking-wide px-4 pt-6 pb-2"
  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
>
  Social
</Text>
<ProfileMenuItem icon="search" label="Find Friends" onPress={() => router.push('/user-search')} />
<ProfileMenuItem
  icon="repeat"
  label="Delegations"
  onPress={() => router.push('/delegations')}
  badge={activeDelegationCount > 0 ? String(activeDelegationCount) : undefined}
/>
```

### Badge count

Show a badge with the number of active/pending delegations:

```typescript
const { data: delegations } = useMyDelegations({
  status: 'pending,accepted,active',
})
const activeDelegationCount = delegations?.total ?? 0
```

This gives the user a quick indicator of delegations needing attention.

## Reference

- Copy from `packages/app/src/screens/profile/ProfileScreen.tsx` (existing menu items)
- Copy badge pattern from `packages/app/src/screens/profile/components/ProfileMenuItem.tsx`

## Tests

No automated tests — verified in Task 22 smoke test.

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
feat(delegation): add Delegations menu item to profile screen
```
