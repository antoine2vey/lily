# Task 13 — Delegation Handlers Wiring

[x] DONE

## Context

Depends on: Task 04 (DelegationApi), Tasks 05–11 (all endpoint functions), Task 12 (LimitChecker).
Wires all delegation endpoint functions and registers in the main API.

## Files to create

- `packages/api/src/services/delegation/service.ts` — DelegationService aggregator
- `packages/api/src/services/delegation/handlers.ts` — DelegationApiLive handler group

## Files to modify

- `packages/api/src/api.ts` — add `.add(DelegationApi.prefix('/api'))`
- `packages/api/src/index.ts` — add `Layer.provide(DelegationApiLive(Api))` + `DelegationRepositoryLive` import

## Implementation

### `service.ts`

```typescript
import { Effect } from 'effect'
import { createDelegation } from '@lily/api/services/delegation/endpoints/create-delegation'
import { respondToDelegation } from '@lily/api/services/delegation/endpoints/respond-delegation'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { completeDelegation } from '@lily/api/services/delegation/endpoints/complete-delegation'
import { getDelegation } from '@lily/api/services/delegation/endpoints/get-delegation'
import { getMyDelegations } from '@lily/api/services/delegation/endpoints/get-my-delegations'
import { getDelegatedTasks } from '@lily/api/services/delegation/endpoints/get-delegated-tasks'

export class DelegationService extends Effect.Service<DelegationService>()(
  'DelegationService',
  {
    effect: Effect.succeed({
      createDelegation,
      respondToDelegation,
      cancelDelegation,
      completeDelegation,
      getDelegation,
      getMyDelegations,
      getDelegatedTasks,
    }),
  }
) {}
```

### `handlers.ts`

```typescript
import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { DelegationService } from '@lily/api/services/delegation/service'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { Effect, Layer } from 'effect'

export const DelegationApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'delegations', (handlers) =>
    Effect.gen(function* () {
      const delegationService = yield* DelegationService

      return handlers
        .handle('createDelegation', ({ payload }) =>
          delegationService.createDelegation(payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('respondToDelegation', ({ path: { delegationId }, payload }) =>
          delegationService
            .respondToDelegation(delegationId, payload)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('cancelDelegation', ({ path: { delegationId } }) =>
          delegationService
            .cancelDelegation(delegationId)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('completeDelegation', ({ path: { delegationId } }) =>
          delegationService
            .completeDelegation(delegationId)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('getDelegation', ({ path: { delegationId } }) =>
          delegationService
            .getDelegation(delegationId)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('getMyDelegations', ({ urlParams }) =>
          delegationService
            .getMyDelegations(urlParams)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('getDelegatedTasks', () =>
          delegationService.getDelegatedTasks.pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(DelegationService.Default),
    Layer.provide(DelegationRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(LimitCheckerLive),
    Layer.provide(AuthenticationLive)
  )
```

### `api.ts` modification

```typescript
import { DelegationApi } from '@lily/api/services/delegation/api'
// ...
.add(DelegationApi.prefix('/api'))
```

### `index.ts` modification

```typescript
import { DelegationApiLive } from '@lily/api/services/delegation/handlers'
// In ApiLive:
Layer.provide(DelegationApiLive(Api)),
```

## Reference

- Copy from `packages/api/src/services/social/handlers.ts` (Task 12 V1)
- Copy wiring from `packages/api/src/api.ts` and `packages/api/src/index.ts`

## Tests

No standalone tests — verified by endpoint tests + typecheck.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run typecheck
cd packages/api && bun run test
```

## Commit

```
feat(delegation): wire delegation handlers and register DelegationApi in main API
```
