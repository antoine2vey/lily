# Task 05 — Create Delegation Endpoint

[x] DONE

## Context

Depends on: Task 03 (DelegationRepository), Task 04 (DelegationApi), Task 12 (LimitChecker gating).
Implements `POST /api/delegations` — create a care delegation request.

## Files to create

- `packages/api/src/services/delegation/endpoints/create-delegation.ts` — endpoint function
- `packages/api/src/__tests__/services/delegation/create-delegation.test.ts` — tests

## Files to modify

None.

## Implementation

### `create-delegation.ts`

```typescript
import { Effect } from 'effect'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import {
  CannotDelegateSelfError,
  DelegationDateError,
  DelegationOverlapError,
  type CreateDelegationRequest,
} from '@lily/shared'
import { UserNotFoundError } from '@lily/shared'

export const createDelegation = (request: CreateDelegationRequest) =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository
    const userRepo = yield* UserRepository
    const limitChecker = yield* LimitChecker

    // 1. Check paid tier access (only paid users can create delegations)
    yield* limitChecker.checkDelegationAccess(currentUserId)

    // 2. Cannot delegate to self
    if (currentUserId === request.caretakerId) {
      return yield* Effect.fail(new CannotDelegateSelfError())
    }

    // 3. Caretaker must exist
    const caretaker = yield* userRepo.findById(request.caretakerId)
    if (!caretaker) {
      return yield* Effect.fail(new UserNotFoundError({ userId: request.caretakerId }))
    }

    // 4. Validate dates
    const startDate = new Date(request.startDate)
    const endDate = new Date(request.endDate)
    const now = new Date()

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return yield* Effect.fail(
        new DelegationDateError({ message: 'Invalid date format' })
      )
    }

    if (startDate < now) {
      return yield* Effect.fail(
        new DelegationDateError({ message: 'Start date must be in the future' })
      )
    }

    if (endDate <= startDate) {
      return yield* Effect.fail(
        new DelegationDateError({ message: 'End date must be after start date' })
      )
    }

    // 5. Check for overlapping delegations on same plants
    const overlapping = yield* delegationRepo.findOverlappingDelegations({
      plantIds: request.plantIds,
      startDate,
      endDate,
    })

    if (overlapping.length > 0) {
      return yield* Effect.fail(
        new DelegationOverlapError({ plantIds: overlapping })
      )
    }

    // 6. Create delegation
    const delegation = yield* delegationRepo.create({
      ownerId: currentUserId,
      caretakerId: request.caretakerId,
      startDate,
      endDate,
      message: request.message,
    })

    // 7. Add plants to delegation
    yield* delegationRepo.addPlants(delegation.id, request.plantIds)

    // 8. Fetch full detail to return
    const detail = yield* delegationRepo.findById(delegation.id)

    return detail!
  }).pipe(Effect.withSpan('DelegationService.createDelegation'))
```

### Business rules

1. **Paid tier only** — `LimitChecker.checkDelegationAccess` fails with `LimitExceededError` for free users
2. Cannot delegate to yourself → 400
3. Caretaker must be an existing user → 404
4. Start date must be in the future → 400
5. End date must be after start date → 400
6. No overlapping active/accepted/pending delegations for the same plants in the same date range → 409
7. Plant IDs must belong to the current user (validated in repository or here)
8. On success, create delegation with status `pending` + add plants + return full detail

## Reference

- Copy endpoint pattern from `packages/api/src/services/plants/endpoints/create-plant.ts`

## Tests

### `create-delegation.test.ts`

```
describe('createDelegation', () => {
  it('should create a delegation with valid data')
  it('should fail with LimitExceededError for free tier users')
  it('should fail with CannotDelegateSelfError when delegating to self')
  it('should fail with UserNotFoundError when caretaker does not exist')
  it('should fail with DelegationDateError when start date is in the past')
  it('should fail with DelegationDateError when end date is before start date')
  it('should fail with DelegationOverlapError when plants have existing delegation')
  it('should set status to pending')
  it('should link specified plants to the delegation')
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
cd packages/api && bun run test create-delegation
```

## Commit

```
feat(delegation): add createDelegation endpoint with validation and overlap check
```
