# Task 09 — Get Delegation Endpoint

[x] DONE

## Context

Depends on: Task 03 (DelegationRepository), Task 04 (DelegationApi).
Implements `GET /api/delegations/:delegationId` — view delegation detail.

## Files to create

- `packages/api/src/services/delegation/endpoints/get-delegation.ts`
- `packages/api/src/__tests__/services/delegation/get-delegation.test.ts`

## Files to modify

None.

## Implementation

### `get-delegation.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  DelegationNotFoundError,
  DelegationNotAuthorizedError,
} from '@lily/shared'

export const getDelegation = (delegationId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository

    const delegation = yield* delegationRepo.findById(delegationId)
    if (!delegation) {
      return yield* Effect.fail(new DelegationNotFoundError({ delegationId }))
    }

    // Only owner or caretaker can view
    if (
      delegation.ownerId !== currentUserId &&
      delegation.caretakerId !== currentUserId
    ) {
      return yield* Effect.fail(
        new DelegationNotAuthorizedError({
          message: 'You are not a participant in this delegation',
        })
      )
    }

    return delegation
  }).pipe(Effect.withSpan('DelegationService.getDelegation'))
```

### Business rules

1. Delegation must exist → 404
2. Only owner or caretaker can view → 403
3. Returns full detail including plants list, user info, timestamps

## Tests

```
describe('getDelegation', () => {
  it('should return delegation detail for the owner')
  it('should return delegation detail for the caretaker')
  it('should include plants list')
  it('should fail with DelegationNotFoundError when not found')
  it('should fail with DelegationNotAuthorizedError for non-participant')
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
cd packages/api && bun run test get-delegation
```

## Commit

```
feat(delegation): add getDelegation endpoint for detail view
```
