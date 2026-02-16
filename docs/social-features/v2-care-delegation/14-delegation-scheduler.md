# Task 14 — Delegation Scheduler

[x] DONE

## Context

Depends on: Task 03 (DelegationRepository), Task 13 (wiring).
Creates the background scheduler that auto-transitions delegations:
- `accepted → active` when `startDate` is reached
- `active → completed` when `endDate` is reached

## Files to create

- `packages/api/src/services/delegation-scheduler/scheduler.ts` — DelegationScheduler

## Files to modify

- `packages/api/src/index.ts` — add `DelegationSchedulerLive` to server layers

## Implementation

### `scheduler.ts`

```typescript
import { Effect, Schedule, Duration } from 'effect'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'

// Runs every 5 minutes
const POLL_INTERVAL = Duration.minutes(5)

const pollAndTransition = Effect.gen(function* () {
  const delegationRepo = yield* DelegationRepository
  const now = new Date()

  // 1. Activate accepted delegations whose startDate has passed
  const toActivate = yield* delegationRepo.findAcceptedReadyToActivate(now)
  yield* Effect.forEach(toActivate, (d) =>
    delegationRepo.updateStatus(d.id, 'active')
  )

  if (toActivate.length > 0) {
    yield* Effect.log(`Activated ${toActivate.length} delegations`)
  }

  // 2. Complete active delegations whose endDate has passed
  const toComplete = yield* delegationRepo.findActiveReadyToComplete(now)
  yield* Effect.forEach(toComplete, (d) =>
    delegationRepo.updateStatus(d.id, 'completed', {
      completedAt: now,
    })
  )

  if (toComplete.length > 0) {
    yield* Effect.log(`Completed ${toComplete.length} delegations`)
  }
}).pipe(Effect.withSpan('DelegationScheduler.pollAndTransition'))

export const startDelegationScheduler = Effect.gen(function* () {
  yield* Effect.log('Delegation scheduler starting...')
  yield* pollAndTransition.pipe(
    Effect.catchAllDefect((defect) =>
      Effect.logError('Delegation scheduler defect', defect)
    ),
    Effect.catchAll((error) =>
      Effect.logError('Delegation scheduler error', error)
    ),
    Effect.repeat(Schedule.spaced(POLL_INTERVAL)),
    Effect.fork
  )
  yield* Effect.log('Delegation scheduler started')
})
```

### `index.ts` modification

Add the scheduler layer:

```typescript
import { startDelegationScheduler } from '@lily/api/services/delegation-scheduler/scheduler'

const DelegationSchedulerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* startDelegationScheduler
  })
).pipe(
  Layer.provide(DelegationRepositoryLive)
)
```

Add to `ServerLive`:
```typescript
Layer.provide(DelegationSchedulerLive),
```

### Design notes

- Polls every 5 minutes (same pattern as notification scheduler)
- Idempotent — safe to run multiple times
- Handles errors gracefully without crashing the server
- Logs transitions for observability
- Can be extended later to send notifications on transitions (see Task 15)

## Reference

- Copy scheduler pattern from `packages/api/src/services/notification-scheduler/scheduler.ts`
- Copy layer wiring from `packages/api/src/index.ts` (NotificationSchedulerLive pattern)

## Tests

### `packages/api/src/__tests__/services/delegation-scheduler/scheduler.test.ts`

```
describe('DelegationScheduler', () => {
  describe('pollAndTransition', () => {
    it('should activate accepted delegations when startDate has passed')
    it('should not activate delegations whose startDate is in the future')
    it('should complete active delegations when endDate has passed')
    it('should not complete delegations whose endDate is in the future')
    it('should handle empty results gracefully')
    it('should process both activations and completions in one poll')
  })
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
cd packages/api && bun run test delegation-scheduler
cd packages/api && bun run typecheck
```

## Commit

```
feat(delegation): add DelegationScheduler for auto status transitions
```
