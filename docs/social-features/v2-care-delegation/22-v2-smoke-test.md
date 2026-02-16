# Task 22 — V2 Smoke Test

[ ] DONE

## Context

Depends on: All V2 tasks (01–21).
Final verification that the entire V2 care delegation feature set works end-to-end.

## Files to create

None.

## Files to modify

None.

## Implementation

This is a verification task, not an implementation task.

### Backend verification

```bash
# 1. All tests pass (V1 + V2)
cd packages/api && bun run test

# 2. Typecheck passes
cd packages/api && bun run typecheck
cd packages/shared && bun run typecheck
cd packages/db && bun run typecheck

# 3. Migration applies cleanly
cd packages/db && bun drizzle-kit push

# 4. API starts without errors (including scheduler)
cd packages/api && bun run dev
# Check logs for: "Delegation scheduler started"
```

### API endpoint smoke tests

```bash
TOKEN="..."
CARETAKER_TOKEN="..."

# 1. Create delegation (as paid user)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "caretakerId": "{caretakerId}",
    "plantIds": ["{plantId1}", "{plantId2}"],
    "startDate": "2026-03-01T00:00:00Z",
    "endDate": "2026-03-08T00:00:00Z",
    "message": "Please water twice a week!"
  }' \
  "http://localhost:3000/api/delegations"

# 2. List delegations
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/delegations?role=owner"

# 3. Get delegation detail
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/delegations/{delegationId}"

# 4. Respond as caretaker (accept)
curl -X POST -H "Authorization: Bearer $CARETAKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accept": true}' \
  "http://localhost:3000/api/delegations/{delegationId}/respond"

# 5. Get delegated tasks (as caretaker)
curl -H "Authorization: Bearer $CARETAKER_TOKEN" \
  "http://localhost:3000/api/delegations/tasks"

# 6. Complete early (as owner)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/delegations/{delegationId}/complete"

# 7. Cancel a delegation
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/delegations/{delegationId}/cancel"

# 8. Verify free tier cannot create
curl -X POST -H "Authorization: Bearer $FREE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"caretakerId": "...", "plantIds": ["..."], "startDate": "...", "endDate": "..."}' \
  "http://localhost:3000/api/delegations"
# Should return 403 LimitExceededError
```

### App verification

```bash
cd packages/app && bun run typecheck
cd packages/app && bun run start
```

Manual checks:
- [ ] Profile screen shows "Delegations" menu item with badge
- [ ] Delegation list screen shows delegations with role filter
- [ ] "Create Delegation" flow works: pick caretaker → select plants → set dates → submit
- [ ] Delegation detail screen shows all info correctly
- [ ] Accept/Reject buttons work for caretaker
- [ ] Cancel/Complete buttons work for owner
- [ ] Care screen shows "Delegated Plants" section for caretaker
- [ ] Push notifications arrive for all lifecycle events
- [ ] Free tier user sees upgrade prompt when trying to create delegation
- [ ] Status badges show correct colors
- [ ] Loading skeletons render correctly

### Edge cases to verify

- [ ] Cannot delegate to yourself
- [ ] Cannot create overlapping delegations for same plants
- [ ] Date validation works (past dates, end before start)
- [ ] Scheduler transitions `accepted → active` on start date
- [ ] Scheduler transitions `active → completed` on end date
- [ ] Cannot respond to already accepted/rejected delegation
- [ ] Cannot cancel already completed delegation
- [ ] Caretaker cannot cancel (only owner)
- [ ] Non-participant cannot view delegation detail

### Scheduler verification

To test the scheduler without waiting:
1. Create a delegation with a past start date (will need to temporarily allow this in dev)
2. Or wait for the scheduler to run (every 5 minutes) and check logs

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run test
cd packages/api && bun run typecheck
cd packages/shared && bun run typecheck
cd packages/db && bun run typecheck
cd packages/app && bun run typecheck
```

## Commit

No commit for this task — it's a verification checkpoint.
