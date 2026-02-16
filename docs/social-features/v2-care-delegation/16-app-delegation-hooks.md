# Task 16 — App Delegation Hooks

[x] DONE

## Context

Depends on: Task 02 (shared types), Task 13 (API wired).
Creates all React Query hooks for delegation features.

## Files to create

- `packages/app/src/hooks/useDelegation.ts` — single delegation detail
- `packages/app/src/hooks/useMyDelegations.ts` — list delegations
- `packages/app/src/hooks/useDelegatedTasks.ts` — caretaker tasks
- `packages/app/src/hooks/useCreateDelegation.ts` — create mutation
- `packages/app/src/hooks/useRespondDelegation.ts` — accept/reject mutation
- `packages/app/src/hooks/useCancelDelegation.ts` — cancel mutation
- `packages/app/src/hooks/useCompleteDelegation.ts` — complete mutation

## Files to modify

- `packages/app/src/utils/query-keys.ts` — add `delegations` domain keys

## Implementation

### Query keys (`query-keys.ts`)

Add to `queryKeys`:
```typescript
delegations: {
  all: ['delegations'] as const,
  lists: () => [...queryKeys.delegations.all, 'getMyDelegations'] as const,
  list: (params?: { role?: string; status?: string }) =>
    [...queryKeys.delegations.lists(), params] as const,
  detail: (id: string) =>
    [...queryKeys.delegations.all, 'getDelegation', id] as const,
  tasks: () => [...queryKeys.delegations.all, 'getDelegatedTasks'] as const,
},
```

Add to `invalidateKeys`:
```typescript
delegations: queryKeys.delegations.all,
```

### Hook patterns

#### `useDelegation.ts`

```typescript
export function useDelegation(delegationId: string) {
  return useEffectQuery(
    'delegations',
    'getDelegation',
    { path: { delegationId } },
    { queryKey: queryKeys.delegations.detail(delegationId) }
  )
}
```

#### `useMyDelegations.ts`

```typescript
export function useMyDelegations(params?: { role?: string; status?: string }) {
  return useEffectQuery(
    'delegations',
    'getMyDelegations',
    {
      urlParams: {
        page: '1',
        limit: '20',
        role: params?.role ?? 'both',
        ...(params?.status ? { status: params.status } : {}),
      },
    },
    { queryKey: queryKeys.delegations.list(params) }
  )
}
```

#### `useDelegatedTasks.ts`

```typescript
export function useDelegatedTasks() {
  return useEffectQuery(
    'delegations',
    'getDelegatedTasks',
    {},
    {
      queryKey: queryKeys.delegations.tasks(),
      staleTime: StaleTime.default,
    }
  )
}
```

#### `useCreateDelegation.ts`

```typescript
export function useCreateDelegation() {
  const queryClient = useQueryClient()
  return useEffectMutation('delegations', 'createDelegation', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.delegations.all })
    },
  })
}
```

#### `useRespondDelegation.ts`

```typescript
export function useRespondDelegation() {
  const queryClient = useQueryClient()
  return useEffectMutation('delegations', 'respondToDelegation', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.delegations.all })
    },
  })
}
```

#### `useCancelDelegation.ts` / `useCompleteDelegation.ts`

Same pattern — mutate + invalidate `queryKeys.delegations.all`.

## Reference

- Copy hook pattern from `packages/app/src/hooks/useCreatePlant.ts`
- Copy query keys from `packages/app/src/utils/query-keys.ts`

## Tests

No tests — verified by typecheck + integration with screens.

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
feat(delegation): add all delegation React Query hooks and query keys
```
