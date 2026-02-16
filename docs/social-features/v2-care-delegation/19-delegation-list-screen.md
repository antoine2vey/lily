# Task 19 — Delegation List Screen

[ ] DONE

## Context

Depends on: Task 16 (delegation hooks).
Creates the DelegationListScreen showing all user's delegations with filtering.

## Files to create

- `packages/app/src/screens/delegation-list/index.ts` — barrel export
- `packages/app/src/screens/delegation-list/DelegationListScreen.tsx` — main screen
- `packages/app/src/screens/delegation-list/components/DelegationCard.tsx` — list item card
- `packages/app/src/screens/delegation-list/components/DelegationListSkeleton.tsx` — skeleton
- `packages/app/app/(app)/delegations.tsx` — route file

## Files to modify

None.

## Implementation

### Route file

```typescript
import { DelegationListScreen } from '@lily/app/screens/delegation-list'

export default function Delegations() {
  return <DelegationListScreen />
}
```

### `DelegationListScreen.tsx`

```tsx
import { useState } from 'react'
import { View, Text, FlatList, Pressable } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { router } from 'expo-router'
import { useMyDelegations } from '@lily/app/hooks/useMyDelegations'
import { DelegationCard } from './components/DelegationCard'
import { DelegationListSkeleton } from './components/DelegationListSkeleton'
import { pipe, Match } from 'effect'

type RoleFilter = 'both' | 'owner' | 'caretaker'

export function DelegationListScreen() {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('both')

  const { data, isLoading } = useMyDelegations({ role: roleFilter })

  // Layout:
  // 1. Header: "Delegations"
  // 2. Filter chips: All | My Plants | Caring For
  // 3. FlatList of DelegationCard items
  // 4. FAB or header button: "Create Delegation" → /delegation-create
  // 5. Empty state: different message per filter
}
```

### Filter chips

```tsx
<View className="flex-row gap-2 px-4 py-3">
  <FilterChip
    label="All"
    active={roleFilter === 'both'}
    onPress={() => setRoleFilter('both')}
  />
  <FilterChip
    label="My Plants"
    active={roleFilter === 'owner'}
    onPress={() => setRoleFilter('owner')}
  />
  <FilterChip
    label="Caring For"
    active={roleFilter === 'caretaker'}
    onPress={() => setRoleFilter('caretaker')}
  />
</View>
```

### `DelegationCard.tsx`

```tsx
// Card showing:
// - Status badge (color-coded)
// - Other person's avatar + name (owner if caretaker, caretaker if owner)
// - Date range: "Jan 15 → Jan 22"
// - Plant count: "3 plants"
// - Tap → router.push(`/delegation/${delegation.id}`)

// Use Match for determining which person to show:
const otherPerson = pipe(
  Match.value(isOwner),
  Match.when(true, () => ({
    name: delegation.caretakerName,
    image: delegation.caretakerImage,
    label: 'Caretaker',
  })),
  Match.orElse(() => ({
    name: delegation.ownerName,
    image: delegation.ownerImage,
    label: 'Owner',
  }))
)
```

### Empty states

- "All" filter: "No delegations yet. Create one to get started!"
- "My Plants" filter: "You haven't delegated any plants yet."
- "Caring For" filter: "No one has asked you to care for their plants yet."

## Reference

- Copy FlatList + filter pattern from `packages/app/src/screens/plants/PlantsScreen.tsx`
- Copy card pattern from existing list items
- Follow NativeWind styling from `packages/app/CLAUDE.md`

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
feat(delegation): add DelegationListScreen with role filtering
```
