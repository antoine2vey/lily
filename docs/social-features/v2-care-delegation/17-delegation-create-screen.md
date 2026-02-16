# Task 17 — Delegation Create Screen

[ ] DONE

## Context

Depends on: Task 16 (delegation hooks), V1 Task 15 (social hooks for user picker).
Creates the DelegationCreateScreen where the plant owner configures a new care delegation.

## Files to create

- `packages/app/src/screens/delegation-create/index.ts` — barrel export
- `packages/app/src/screens/delegation-create/DelegationCreateScreen.tsx` — main screen
- `packages/app/src/screens/delegation-create/components/CaretakerPicker.tsx` — search + select caretaker
- `packages/app/src/screens/delegation-create/components/PlantSelector.tsx` — multi-select plants
- `packages/app/src/screens/delegation-create/components/DateRangePicker.tsx` — start/end date picker
- `packages/app/app/(app)/delegation-create.tsx` — route file

## Files to modify

None.

## Implementation

### Route file: `app/(app)/delegation-create.tsx`

```typescript
import { DelegationCreateScreen } from '@lily/app/screens/delegation-create'

export default function DelegationCreate() {
  return <DelegationCreateScreen />
}
```

### `DelegationCreateScreen.tsx`

```tsx
import { useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { router } from 'expo-router'
import { useCreateDelegation } from '@lily/app/hooks/useCreateDelegation'
import { usePlants } from '@lily/app/hooks/usePlants'
import { CaretakerPicker } from './components/CaretakerPicker'
import { PlantSelector } from './components/PlantSelector'
import { DateRangePicker } from './components/DateRangePicker'

export function DelegationCreateScreen() {
  const [caretakerId, setCaretakerId] = useState<string | null>(null)
  const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [message, setMessage] = useState('')

  const { mutate: createDelegation, isPending } = useCreateDelegation()
  const { data: plants } = usePlants()

  const canSubmit =
    caretakerId !== null &&
    selectedPlantIds.length > 0 &&
    startDate !== null &&
    endDate !== null

  const handleSubmit = () => {
    if (!canSubmit) return
    createDelegation(
      {
        payload: {
          caretakerId: caretakerId!,
          plantIds: selectedPlantIds,
          startDate: startDate!.toISOString(),
          endDate: endDate!.toISOString(),
          message: message || undefined,
        },
      },
      {
        onSuccess: (data) => {
          router.replace(`/delegation/${data.id}`)
        },
      }
    )
  }

  // Layout:
  // 1. "Who's caring for your plants?" — CaretakerPicker
  // 2. "Which plants?" — PlantSelector (multi-select from user's plants)
  // 3. "When?" — DateRangePicker (start + end)
  // 4. "Message" — optional TextInput
  // 5. "Create Delegation" — primary button (disabled until all required fields)
}
```

### `CaretakerPicker.tsx`

- Search input that uses `useSearchUsers` hook from V1
- Shows results as selectable items
- Selected user shown as chip with avatar + name
- Can also show following list as quick picks

### `PlantSelector.tsx`

- Uses `usePlants()` to get user's plants
- Multi-select checkboxes
- Each item shows plant avatar, name, health status
- "Select All" / "Deselect All" buttons
- Selected count badge

### `DateRangePicker.tsx`

- Two date picker buttons: "Start Date" and "End Date"
- Uses `@react-native-community/datetimepicker` or Expo's date picker
- Validates: start must be in future, end must be after start
- Shows formatted dates after selection

### Validation

- All fields required except message
- Start date must be in the future
- End date must be after start date
- At least 1 plant must be selected
- Caretaker must be selected
- Show inline validation errors

### Error handling

- `LimitExceededError` → show upgrade CTA modal
- `DelegationOverlapError` → highlight conflicting plants
- `DelegationDateError` → show inline date error

## Reference

- Copy form pattern from `packages/app/src/screens/edit-profile/EditProfileScreen.tsx`
- Copy multi-select from any existing selector pattern in the app
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
feat(delegation): add DelegationCreateScreen with caretaker/plant/date pickers
```
