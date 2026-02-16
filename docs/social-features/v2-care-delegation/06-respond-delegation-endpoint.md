# Task 06 — Respond to Delegation Endpoint

[x] DONE

## Context

Depends on: Task 03 (DelegationRepository), Task 04 (DelegationApi).
Implements `POST /api/delegations/:delegationId/respond` — caretaker accepts or rejects.

## Files to create

- `packages/api/src/services/delegation/endpoints/respond-delegation.ts`
- `packages/api/src/__tests__/services/delegation/respond-delegation.test.ts`

## Files to modify

None.

## Implementation

### `respond-delegation.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  DelegationNotFoundError,
  DelegationNotAuthorizedError,
  DelegationInvalidStatusError,
} from '@lily/shared'

export const respondToDelegation = (
  delegationId: string,
  params: { accept: boolean }
) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository

    // 1. Delegation must exist
    const delegation = yield* delegationRepo.findById(delegationId)
    if (!delegation) {
      return yield* Effect.fail(new DelegationNotFoundError({ delegationId }))
    }

    // 2. Only the caretaker can respond
    if (delegation.caretakerId !== currentUserId) {
      return yield* Effect.fail(
        new DelegationNotAuthorizedError({
          message: 'Only the caretaker can respond to a delegation request',
        })
      )
    }

    // 3. Must be in pending status
    if (delegation.status !== 'pending') {
      return yield* Effect.fail(
        new DelegationInvalidStatusError({
          currentStatus: delegation.status,
          expectedStatus: 'pending',
          message: 'This delegation has already been responded to',
        })
      )
    }

    // 4. Update status
    const newStatus = params.accept ? 'accepted' : 'rejected'
    yield* delegationRepo.updateStatus(delegationId, newStatus, {
      respondedAt: new Date(),
    })

    // 5. Return updated delegation
    const updated = yield* delegationRepo.findById(delegationId)
    return updated!
  }).pipe(Effect.withSpan('DelegationService.respondToDelegation'))
```

### Business rules

1. Delegation must exist → 404
2. Only the designated caretaker can respond → 403
3. Delegation must be in `pending` status → 409
4. If accepted → status becomes `accepted`, `respondedAt` set
5. If rejected → status becomes `rejected`, `respondedAt` set
6. Note: `accepted` does NOT mean `active` — the scheduler transitions `accepted → active` on startDate

## Reference

- Copy endpoint pattern from `packages/api/src/services/plants/endpoints/update-plant.ts`

## Tests

### `respond-delegation.test.ts`

```
describe('respondToDelegation', () => {
  it('should accept a pending delegation')
  it('should reject a pending delegation')
  it('should set respondedAt timestamp')
  it('should fail with DelegationNotFoundError when not found')
  it('should fail with DelegationNotAuthorizedError when not the caretaker')
  it('should fail with DelegationInvalidStatusError when not pending')
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
cd packages/api && bun run test respond-delegation
```

## Commit

```
feat(delegation): add respondToDelegation endpoint for accept/reject
```
