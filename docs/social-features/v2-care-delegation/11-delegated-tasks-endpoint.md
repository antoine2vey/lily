# Task 11 — Delegated Tasks Endpoint

[x] DONE

## Context

Depends on: Task 03 (DelegationRepository), Task 04 (DelegationApi).
Implements `GET /api/delegations/tasks` — list of plants the caretaker needs to care for.

## Files to create

- `packages/api/src/services/delegation/endpoints/get-delegated-tasks.ts`
- `packages/api/src/__tests__/services/delegation/get-delegated-tasks.test.ts`

## Files to modify

None.

## Implementation

### `get-delegated-tasks.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'

export const getDelegatedTasks = Effect.gen(function* () {
  const { id: currentUserId } = yield* CurrentUser
  const delegationRepo = yield* DelegationRepository

  const tasks = yield* delegationRepo.findActiveDelegationsForCaretaker(currentUserId)

  return tasks
}).pipe(Effect.withSpan('DelegationService.getDelegatedTasks'))
```

### Business rules

1. Returns a flat list of `DelegatedCareTask` across all **active** delegations where the current user is caretaker
2. Each task includes: delegationId, plantId, plantName, plantImage, ownerName, nextWateringAt, nextFertilizationAt, health
3. Ordered by `nextWateringAt` ascending (most urgent first, nulls last)
4. Not paginated — returns all active tasks (expected to be a manageable number)

### Use case

The caretaker opens the "Care" tab in the app and sees a "Delegated Plants" section (added in Task 20). This endpoint powers that section, showing which plants need attention.

## Reference

- Copy endpoint pattern from `packages/api/src/services/care-tasks/endpoints/find-care-tasks.ts`

## Tests

```
describe('getDelegatedTasks', () => {
  it('should return delegated plants for active delegations')
  it('should return empty array when no active delegations')
  it('should include plant care details (watering, health)')
  it('should include owner name')
  it('should order by next watering date (most urgent first)')
  it('should not include plants from completed/canceled delegations')
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
cd packages/api && bun run test get-delegated-tasks
```

## Commit

```
feat(delegation): add getDelegatedTasks endpoint for caretaker view
```
