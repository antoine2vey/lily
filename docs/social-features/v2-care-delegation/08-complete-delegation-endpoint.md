# Task 08 — Complete Delegation Endpoint

[x] DONE

## Context

Depends on: Task 03 (DelegationRepository), Task 04 (DelegationApi).
Implements `POST /api/delegations/:delegationId/complete` — owner early-completes an active delegation.

## Files to create

- `packages/api/src/services/delegation/endpoints/complete-delegation.ts`
- `packages/api/src/__tests__/services/delegation/complete-delegation.test.ts`

## Files to modify

None.

## Implementation

### `complete-delegation.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  DelegationNotFoundError,
  DelegationNotAuthorizedError,
  DelegationInvalidStatusError,
} from '@lily/shared'

export const completeDelegation = (delegationId: string) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository

    const delegation = yield* delegationRepo.findById(delegationId)
    if (!delegation) {
      return yield* Effect.fail(new DelegationNotFoundError({ delegationId }))
    }

    // Only the owner can early-complete
    if (delegation.ownerId !== currentUserId) {
      return yield* Effect.fail(
        new DelegationNotAuthorizedError({
          message: 'Only the delegation owner can complete early',
        })
      )
    }

    // Must be active
    if (delegation.status !== 'active') {
      return yield* Effect.fail(
        new DelegationInvalidStatusError({
          currentStatus: delegation.status,
          expectedStatus: 'active',
          message: 'Only active delegations can be completed early',
        })
      )
    }

    yield* delegationRepo.updateStatus(delegationId, 'completed', {
      completedAt: new Date(),
    })

    const updated = yield* delegationRepo.findById(delegationId)
    return updated!
  }).pipe(Effect.withSpan('DelegationService.completeDelegation'))
```

### Business rules

1. Delegation must exist → 404
2. Only the owner can early-complete → 403
3. Must be in `active` status → 409
4. Status becomes `completed`, `completedAt` set
5. Different from auto-complete by scheduler — this is a manual "I'm back from vacation" action

## Tests

```
describe('completeDelegation', () => {
  it('should complete an active delegation early')
  it('should set completedAt timestamp')
  it('should fail when not the owner')
  it('should fail when delegation is pending')
  it('should fail when delegation is accepted (not yet active)')
  it('should fail when already completed')
  it('should fail when not found')
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
cd packages/api && bun run test complete-delegation
```

## Commit

```
feat(delegation): add completeDelegation endpoint for early completion
```
