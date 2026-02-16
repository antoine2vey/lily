# Task 04 — Delegation API Definition

[x] DONE

## Context

Depends on: Task 02 (shared types).
Defines the HttpApiGroup with all delegation endpoint signatures.

## Files to create

- `packages/api/src/services/delegation/api.ts` — DelegationApi HttpApiGroup definition

## Files to modify

None (wiring in Task 13).

## Implementation

### `packages/api/src/services/delegation/api.ts`

```typescript
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  CreateDelegationRequest,
  Delegation,
  DelegatedCareTask,
  DelegationListResponse,
  RespondDelegationRequest,
  PaginationParams,
} from '@lily/shared'
import {
  CannotDelegateSelfError,
  DelegationDateError,
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  DelegationOverlapError,
} from '@lily/shared'
import { LimitExceededError, UserNotFoundError } from '@lily/shared'
import { Schema } from 'effect'

const delegationIdParam = HttpApiSchema.param('delegationId', Schema.String)

// Query params for listing delegations
const DelegationListParams = Schema.Struct({
  ...PaginationParams.fields,
  role: Schema.optionalWith(Schema.String, { default: () => 'both' }),
  status: Schema.optional(Schema.String), // comma-separated statuses
})

export const DelegationApi = HttpApiGroup.make('delegations')
  // POST /delegations — Create a new delegation
  .add(
    HttpApiEndpoint.post('createDelegation')`/`
      .setPayload(CreateDelegationRequest)
      .addSuccess(Delegation, { status: 201 })
      .addError(LimitExceededError, { status: 403 })
      .addError(CannotDelegateSelfError, { status: 400 })
      .addError(DelegationDateError, { status: 400 })
      .addError(DelegationOverlapError, { status: 409 })
      .addError(UserNotFoundError, { status: 404 })
  )
  // POST /delegations/:delegationId/respond — Accept or reject
  .add(
    HttpApiEndpoint.post('respondToDelegation')`/${delegationIdParam}/respond`
      .setPayload(RespondDelegationRequest)
      .addSuccess(Delegation)
      .addError(DelegationNotFoundError, { status: 404 })
      .addError(DelegationNotAuthorizedError, { status: 403 })
      .addError(DelegationInvalidStatusError, { status: 409 })
  )
  // POST /delegations/:delegationId/cancel — Cancel a delegation (owner only)
  .add(
    HttpApiEndpoint.post('cancelDelegation')`/${delegationIdParam}/cancel`
      .addSuccess(Delegation)
      .addError(DelegationNotFoundError, { status: 404 })
      .addError(DelegationNotAuthorizedError, { status: 403 })
      .addError(DelegationInvalidStatusError, { status: 409 })
  )
  // POST /delegations/:delegationId/complete — Early complete (owner only)
  .add(
    HttpApiEndpoint.post('completeDelegation')`/${delegationIdParam}/complete`
      .addSuccess(Delegation)
      .addError(DelegationNotFoundError, { status: 404 })
      .addError(DelegationNotAuthorizedError, { status: 403 })
      .addError(DelegationInvalidStatusError, { status: 409 })
  )
  // GET /delegations/:delegationId — Get delegation detail
  .add(
    HttpApiEndpoint.get('getDelegation')`/${delegationIdParam}`
      .addSuccess(Delegation)
      .addError(DelegationNotFoundError, { status: 404 })
      .addError(DelegationNotAuthorizedError, { status: 403 })
  )
  // GET /delegations — List my delegations
  .add(
    HttpApiEndpoint.get('getMyDelegations')`/`
      .setUrlParams(DelegationListParams)
      .addSuccess(DelegationListResponse)
  )
  // GET /delegations/tasks — Get delegated care tasks (caretaker view)
  .add(
    HttpApiEndpoint.get('getDelegatedTasks')`/tasks`
      .addSuccess(Schema.Array(DelegatedCareTask))
  )
  .prefix('/delegations')
  .middleware(Authentication)
```

### Design notes

- All endpoints require authentication
- `createDelegation` gated by paid tier via `LimitExceededError`
- `respondToDelegation` only callable by the caretaker
- `cancelDelegation` only callable by the owner, allowed in `pending`/`accepted`/`active` states
- `completeDelegation` only callable by the owner, allowed in `active` state (early completion)
- `getDelegation` viewable by either owner or caretaker
- `getMyDelegations` returns all delegations where user is owner or caretaker (filterable by role/status)
- `getDelegatedTasks` returns flat list of plants the caretaker needs to care for across all active delegations

## Reference

- Copy HttpApiGroup pattern from `packages/api/src/services/subscriptions/api.ts`

## Tests

No unit tests for API definitions — verified by typecheck.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run typecheck
```

## Commit

```
feat(delegation): define DelegationApi HttpApiGroup with all endpoint signatures
```
