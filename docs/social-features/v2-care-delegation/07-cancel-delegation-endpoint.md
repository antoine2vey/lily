# Task 07 — Cancel Delegation Endpoint

[x] DONE

## Context

Depends on: Task 03 (DelegationRepository), Task 04 (DelegationApi).
Implements `POST /api/delegations/:delegationId/cancel` — owner cancels a delegation.

## Files to create

- `packages/api/src/services/delegation/endpoints/cancel-delegation.ts`
- `packages/api/src/__tests__/services/delegation/cancel-delegation.test.ts`

## Files to modify

None.

## Implementation

### `cancel-delegation.ts`

```typescript
import { Effect, Array as Arr } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  DelegationNotFoundError,
  DelegationNotAuthorizedError,
  DelegationInvalidStatusError,
} from '@lily/shared'

const CANCELABLE_STATUSES = ['pending', 'accepted', 'active']

export const cancelDelegation = (delegationId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository

    const delegation = yield* delegationRepo.findById(delegationId)
    if (!delegation) {
      return yield* Effect.fail(new DelegationNotFoundError({ delegationId }))
    }

    // Only the owner can cancel
    if (delegation.ownerId !== currentUserId) {
      return yield* Effect.fail(
        new DelegationNotAuthorizedError({
          message: 'Only the delegation owner can cancel',
        })
      )
    }

    // Must be in a cancelable status
    if (!Arr.contains(CANCELABLE_STATUSES, delegation.status)) {
      return yield* Effect.fail(
        new DelegationInvalidStatusError({
          currentStatus: delegation.status,
          expectedStatus: 'pending, accepted, or active',
          message: 'This delegation cannot be canceled in its current state',
        })
      )
    }

    yield* delegationRepo.updateStatus(delegationId, 'canceled', {
      canceledAt: new Date(),
    })

    const updated = yield* delegationRepo.findById(delegationId)
    return updated!
  }).pipe(Effect.withSpan('DelegationService.cancelDelegation'))
```

### Business rules

1. Delegation must exist → 404
2. Only the owner can cancel → 403
3. Can cancel from `pending`, `accepted`, or `active` → 409 if in `rejected`/`completed`/`canceled`
4. Status becomes `canceled`, `canceledAt` set

## Tests

```
describe('cancelDelegation', () => {
  it('should cancel a pending delegation')
  it('should cancel an accepted delegation')
  it('should cancel an active delegation')
  it('should fail when delegation is already completed')
  it('should fail when delegation is already canceled')
  it('should fail when delegation is rejected')
  it('should fail when not the owner')
  it('should fail when delegation not found')
  it('should set canceledAt timestamp')
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
cd packages/api && bun run test cancel-delegation
```

## Commit

```
feat(delegation): add cancelDelegation endpoint for owner cancellation
```
