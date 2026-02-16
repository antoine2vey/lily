# Task 18 — Delegation Detail Screen

[ ] DONE

## Context

Depends on: Task 16 (delegation hooks).
Creates the DelegationDetailScreen showing full delegation info with action buttons.

## Files to create

- `packages/app/src/screens/delegation-detail/index.ts` — barrel export
- `packages/app/src/screens/delegation-detail/DelegationDetailScreen.tsx` — main screen
- `packages/app/src/screens/delegation-detail/components/DelegationStatusBadge.tsx` — status chip
- `packages/app/src/screens/delegation-detail/components/DelegationPlantList.tsx` — plants in delegation
- `packages/app/src/screens/delegation-detail/components/DelegationActions.tsx` — action buttons
- `packages/app/src/screens/delegation-detail/components/DelegationDetailSkeleton.tsx` — loading skeleton
- `packages/app/app/(app)/delegation/[delegationId].tsx` — route file

## Files to modify

None.

## Implementation

### Route file

```typescript
import { useLocalSearchParams } from 'expo-router'
import { DelegationDetailScreen } from '@lily/app/screens/delegation-detail'

export default function DelegationDetail() {
  const { delegationId } = useLocalSearchParams<{ delegationId: string }>()
  return <DelegationDetailScreen delegationId={delegationId} />
}
```

### `DelegationDetailScreen.tsx`

```tsx
import { View, Text, ScrollView } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useDelegation } from '@lily/app/hooks/useDelegation'
import { useUser } from '@lily/app/hooks/useUser'
import { DelegationStatusBadge } from './components/DelegationStatusBadge'
import { DelegationPlantList } from './components/DelegationPlantList'
import { DelegationActions } from './components/DelegationActions'
import { DelegationDetailSkeleton } from './components/DelegationDetailSkeleton'

export function DelegationDetailScreen({ delegationId }: { delegationId: string }) {
  const { data: delegation, isLoading } = useDelegation(delegationId)
  const { data: user } = useUser()

  const isOwner = user?.id === delegation?.ownerId
  const isCaretaker = user?.id === delegation?.caretakerId

  // Layout:
  // 1. Status badge (color-coded)
  // 2. Owner/Caretaker info (avatars + names)
  // 3. Date range (start → end, with duration)
  // 4. Message (if present)
  // 5. Plant list
  // 6. Action buttons (context-dependent)
  // 7. Timestamps (created, responded, etc.)
}
```

### `DelegationStatusBadge.tsx`

Color-coded status chip using Match:

```tsx
const getStatusColor = (status: DelegationStatus) =>
  pipe(
    Match.value(status),
    Match.when('pending', () => 'bg-warning'),
    Match.when('accepted', () => 'bg-info'),
    Match.when('active', () => 'bg-success'),
    Match.when('completed', () => 'bg-text-muted'),
    Match.when('rejected', () => 'bg-error'),
    Match.when('canceled', () => 'bg-text-muted'),
    Match.exhaustive
  )
```

### `DelegationActions.tsx`

Context-dependent buttons based on status + role:

| Status | Owner sees | Caretaker sees |
|--------|-----------|----------------|
| pending | Cancel button | Accept / Reject buttons |
| accepted | Cancel button | Nothing (waiting for start date) |
| active | Complete early / Cancel | Nothing (just care for plants) |
| completed | Nothing | Nothing |
| rejected | Nothing | Nothing |
| canceled | Nothing | Nothing |

### `DelegationPlantList.tsx`

List of plants in the delegation:
- Plant avatar, name, health badge
- Next watering date
- Tappable → navigates to plant detail (if owner's plant)

## Reference

- Copy screen pattern from `packages/app/src/screens/plant-detail/`
- Copy status badge from any existing badge component
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
feat(delegation): add DelegationDetailScreen with status, plants, and actions
```
