# Task 20 — Care Screen Updates

[ ] DONE

## Context

Depends on: Task 16 (delegation hooks).
Adds a "Delegated Plants" section to the existing Care screen, showing plants the user is caring for on behalf of others.

## Files to create

- `packages/app/src/screens/care/components/DelegatedTasksSection.tsx` — delegated tasks component

## Files to modify

- `packages/app/src/screens/care/CareScreen.tsx` (or equivalent care screen) — add DelegatedTasksSection

## Implementation

### `DelegatedTasksSection.tsx`

```tsx
import { View, Text, Pressable } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { router } from 'expo-router'
import { useDelegatedTasks } from '@lily/app/hooks/useDelegatedTasks'
import { Array as Arr } from 'effect'

export function DelegatedTasksSection() {
  const { data: tasks } = useDelegatedTasks()

  // Don't render section if no delegated tasks
  if (!tasks || tasks.length === 0) return null

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      {/* Section header */}
      <View className="flex-row items-center justify-between px-4 pt-6 pb-2">
        <Text
          className="text-[11px] text-text-muted uppercase tracking-wide"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          Delegated Plants
        </Text>
        <Pressable onPress={() => router.push('/delegations')}>
          <Text className="text-sm text-primary">View All</Text>
        </Pressable>
      </View>

      {/* Task cards */}
      <View className="px-4 gap-2">
        {Arr.map(tasks, (task) => (
          <Pressable
            key={task.plantId}
            className="flex-row items-center p-3 bg-surface rounded-lg"
            onPress={() => router.push(`/delegation/${task.delegationId}`)}
          >
            {/* Plant avatar */}
            {/* Plant name + owner name */}
            {/* Next watering info */}
            {/* Health badge */}
          </Pressable>
        ))}
      </View>
    </Animated.View>
  )
}
```

### Integration into Care Screen

Add `<DelegatedTasksSection />` above or below the existing care tasks section:

```tsx
// In CareScreen.tsx
import { DelegatedTasksSection } from './components/DelegatedTasksSection'

// In the render:
<ScrollView>
  {/* Existing care tasks */}
  <CareTasksSection />

  {/* New: delegated plants section */}
  <DelegatedTasksSection />
</ScrollView>
```

### Design notes

- Section only appears if the user has active delegated tasks
- Shows plant name, owner name ("for {ownerName}"), next watering date
- Tapping a task navigates to the delegation detail screen
- "View All" link goes to delegation list screen
- Subtle visual distinction from own care tasks (e.g., different icon or label)

## Reference

- Copy section pattern from existing care screen components
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
feat(delegation): add DelegatedTasksSection to care screen
```
