# Task 10 — Get My Delegations Endpoint

[x] DONE

## Context

Depends on: Task 03 (DelegationRepository), Task 04 (DelegationApi).
Implements `GET /api/delegations` — list delegations for the current user.

## Files to create

- `packages/api/src/services/delegation/endpoints/get-my-delegations.ts`
- `packages/api/src/__tests__/services/delegation/get-my-delegations.test.ts`

## Files to modify

None.

## Implementation

### `get-my-delegations.ts`

```typescript
import { Effect, pipe, Array as Arr, String as Str } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { parsePaginationParams, paginate } from '@lily/api/services/helpers/pagination'

export const getMyDelegations = (params: {
  page?: string
  limit?: string
  role?: string
  status?: string
}) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository
    const { page, limit } = parsePaginationParams(params)

    // Parse role filter (owner | caretaker | both)
    const role = pipe(
      params.role ?? 'both',
      (r) => (r === 'owner' || r === 'caretaker') ? r : 'both' as const
    )

    // Parse status filter (comma-separated)
    const statusFilter = params.status
      ? pipe(Str.split(params.status, ','), Arr.filter((s) => s.length > 0))
      : undefined

    const { items, total } = yield* delegationRepo.findByUser({
      userId: currentUserId,
      role,
      status: statusFilter,
      page,
      limit,
    })

    return paginate(items, total, page, limit)
  }).pipe(Effect.withSpan('DelegationService.getMyDelegations'))
```

### Business rules

1. Returns delegations where user is owner, caretaker, or both (default: both)
2. Filterable by status (comma-separated: `?status=pending,accepted`)
3. Paginated, ordered by `createdAt` descending
4. Each item is a `DelegationListItem` (lighter than full detail — no plants list, just `plantCount`)

### Query params

- `role` — `owner` | `caretaker` | `both` (default: `both`)
- `status` — comma-separated status values to filter by (optional)
- `page`, `limit` — standard pagination

## Reference

- Copy pagination pattern from `packages/api/src/services/plants/endpoints/find-plants.ts`

## Tests

```
describe('getMyDelegations', () => {
  it('should return delegations where user is owner')
  it('should return delegations where user is caretaker')
  it('should return both roles by default')
  it('should filter by role=owner')
  it('should filter by role=caretaker')
  it('should filter by status')
  it('should return paginated results')
  it('should include plantCount for each delegation')
  it('should order by createdAt descending')
})
```

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run test get-my-delegations
```

## Commit

```
feat(delegation): add getMyDelegations endpoint with role and status filters
```
