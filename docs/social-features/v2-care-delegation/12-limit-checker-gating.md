# Task 12 — Limit Checker Gating

[x] DONE

## Context

Depends on: Task 05 (createDelegation uses it).
Adds `checkDelegationAccess` to the existing LimitChecker to gate delegation creation to paid tier.

## Files to create

None.

## Files to modify

- `packages/api/src/services/subscriptions/limit-checker.ts` — add `checkDelegationAccess` method

## Implementation

### Update `ILimitChecker` interface

Add:
```typescript
readonly checkDelegationAccess: (userId: string) => Effect.Effect<void, LimitExceededError | SqlError>
```

### Update `LimitCheckerLive` implementation

```typescript
checkDelegationAccess: (userId: string) =>
  Effect.gen(function* () {
    const { tierConfig } = yield* getUserTierAndLimits(userId)

    // Only paid users can create delegations
    if (tierConfig.tier === 'free') {
      return yield* Effect.fail(
        new LimitExceededError({
          feature: 'care_delegation',
          limit: 0,
          current: 0,
          message: 'Care delegation is a premium feature. Upgrade to create delegations.',
        })
      )
    }
  }).pipe(Effect.withSpan('LimitChecker.checkDelegationAccess')),
```

### Update noop limit checker (for tests)

Add to `noopLimitChecker`:
```typescript
checkDelegationAccess: () => Effect.void,
```

### Update mock limit checker

Add to `MockLimitCheckerLive` in `packages/api/src/__tests__/mocks/limit-checker.ts`:
```typescript
checkDelegationAccess: () => Effect.void,
```

### Design notes

- Only the delegation **creator** (owner) needs paid tier
- The **caretaker** does not need a paid subscription to accept and care for plants
- This is a simple tier check, not a usage-based limit (no counter needed)

## Reference

- Copy from existing methods in `packages/api/src/services/subscriptions/limit-checker.ts`

## Tests

### Update existing limit checker tests

```
describe('checkDelegationAccess', () => {
  it('should pass for paid tier users')
  it('should fail with LimitExceededError for free tier users')
  it('should pass when limits are disabled')
})
```

Add to `packages/api/src/__tests__/services/subscriptions/limit-checker.test.ts`.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run test limit-checker
```

## Commit

```
feat(delegation): add checkDelegationAccess to LimitChecker for paid tier gating
```
