# Task 15 — Delegation Notifications

[x] DONE

## Context

Depends on: Task 13 (handlers wired), Task 14 (scheduler).
Adds push notifications for all delegation lifecycle events.

## Files to create

None (notifications created inline in existing endpoints/scheduler).

## Files to modify

- `packages/api/src/services/delegation/endpoints/create-delegation.ts` — notify caretaker of new request
- `packages/api/src/services/delegation/endpoints/respond-delegation.ts` — notify owner of accept/reject
- `packages/api/src/services/delegation/endpoints/cancel-delegation.ts` — notify caretaker of cancellation
- `packages/api/src/services/delegation-scheduler/scheduler.ts` — notify both parties on activation and completion

## Implementation

### Notification types

| Event | Notification Type | Recipient | Title | Body |
|-------|------------------|-----------|-------|------|
| Delegation created | `delegation_request` | caretaker | "Care request" | "{ownerName} wants you to care for their plants" |
| Delegation accepted | `delegation_accepted` | owner | "Request accepted" | "{caretakerName} accepted your care delegation" |
| Delegation rejected | `delegation_rejected` | owner | "Request declined" | "{caretakerName} declined your care delegation" |
| Delegation canceled | `delegation_canceled` | caretaker | "Delegation canceled" | "{ownerName} canceled the care delegation" |
| Delegation activated | `delegation_activated` | both | "Delegation started" | "Care delegation for {plantCount} plants has started" |
| Delegation completed | `delegation_completed` | both | "Delegation ended" | "Care delegation for {plantCount} plants has ended" |

### Implementation pattern

In each endpoint, after the status update:

```typescript
const notificationRepo = yield* NotificationRepository

// Example: create-delegation.ts
yield* notificationRepo.create({
  userId: request.caretakerId,
  type: 'delegation_request',
  title: 'Care request',
  body: `${currentUserName ?? 'Someone'} wants you to care for their plants`,
  scheduledAt: new Date(),
})
```

### Scheduler notifications

In `pollAndTransition`, after activating or completing:

```typescript
// After activating:
yield* Effect.forEach(toActivate, (d) =>
  Effect.gen(function* () {
    yield* delegationRepo.updateStatus(d.id, 'active')
    const plants = yield* delegationRepo.getPlantsByDelegation(d.id)
    // Notify both owner and caretaker
    yield* notificationRepo.create({
      userId: d.ownerId,
      type: 'delegation_activated',
      title: 'Delegation started',
      body: `Care delegation for ${plants.length} plants has started`,
      scheduledAt: new Date(),
    })
    yield* notificationRepo.create({
      userId: d.caretakerId,
      type: 'delegation_activated',
      title: 'Delegation started',
      body: `Care delegation for ${plants.length} plants has started`,
      scheduledAt: new Date(),
    })
  })
)
```

### Add NotificationRepository dependency

Add `NotificationRepository` to the requirements of all modified endpoints and the scheduler. Update handler layers accordingly.

## Reference

- Copy notification creation from `packages/api/src/services/notification-scheduler/scheduler.ts`
- See existing notification types in `packages/db/src/schema/notifications.ts`

## Tests

Update existing tests for each endpoint to verify notification creation:

```
it('should create delegation_request notification for caretaker on creation')
it('should create delegation_accepted notification for owner on accept')
it('should create delegation_rejected notification for owner on reject')
it('should create delegation_canceled notification for caretaker on cancel')
```

Add scheduler tests:
```
it('should create delegation_activated notifications for both parties')
it('should create delegation_completed notifications for both parties')
```

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run test
```

## Commit

```
feat(delegation): add push notifications for all delegation lifecycle events
```
