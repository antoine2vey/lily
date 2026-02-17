# API Security Audit - Findings & Fix Plan

## Executive Summary

After a comprehensive review of every endpoint, handler, service, and repository in the Lily API, I identified **13 security vulnerabilities** across 5 severity levels. The most critical issues are **IDOR (Insecure Direct Object Reference)** vulnerabilities where authenticated users can access or manipulate other users' resources by guessing resource IDs.

---

## Confirmed Vulnerabilities

### CRITICAL: IDOR - Missing Ownership Checks

#### V1. `GET /plants/:id` - Any user can view any plant
**File:** `packages/api/src/services/plants/handlers.ts:69-70`
```typescript
.handle('getPlant', ({ path: { id } }) =>
  plantsService.findPlantById({ id }).pipe(withInfraErrorsAsDefect)
  // Missing: withPlantAuth(id)
)
```
**Impact:** Any authenticated user can retrieve full details (name, care schedule, health, room, photos) of any plant in the system by guessing/enumerating UUIDs.

**Fix:** Add `withPlantAuth(id)` to the handler pipeline, consistent with `updatePlant`, `deletePlant`, etc.

---

#### V2. `GET /plants/:plantId/photos` - Any user can view any plant's photos
**File:** `packages/api/src/services/plants/handlers.ts:82-89`
```typescript
.handle('getPlantPhotos', ({ path: { id }, urlParams }) =>
  plantsService.getPlantPhotos({...}).pipe(withInfraErrorsAsDefect)
  // Missing: withPlantAuth(id)
)
```
**Impact:** Any authenticated user can enumerate and view all photos of any plant.

**Fix:** Add `withPlantAuth(id)` to the handler pipeline.

---

#### V3. All Care-Log endpoints - No plant ownership verification
**File:** `packages/api/src/services/care-logs/handlers.ts:27-58`

All 5 care-log endpoints (`getCareLogs`, `createCareLog`, `getCareLog`, `updateCareLog`, `deleteCareLog`) operate on `plantId` from URL params without verifying the plant belongs to the authenticated user.

**Impact:** Any authenticated user can:
- **Read** all care history of any plant
- **Create** false care logs on any plant (corrupting care data, triggering health status changes)
- **Modify** existing care logs on any plant
- **Delete** care logs from any plant

**Fix:** Add `withPlantAuth(plantId)` to each handler in the care-logs group, or create a shared middleware that wraps all care-log handlers.

---

#### V4. AI Chat - No plant ownership check
**File:** `packages/api/src/services/ai-chat/plant-chat.ts:55-59`
```typescript
const plant = yield* plantRepo.findById(plantId)
if (!plant) {
  return yield* Effect.fail(new PlantNotFoundError({ plantId }))
}
// Missing: ownership check (plant.userId !== userId)
```
**Impact:** Any authenticated user can:
- Chat about another user's plant and receive AI-generated care advice based on that plant's private data
- View chat history for another user's plant
- Trigger AI diagnoses on another user's plant
- Upload images to another user's plant chat

**Fix:** Add ownership/access check after plant lookup:
```typescript
yield* assertCanAccessPlant(plant.userId, plant.id)
```

---

#### V5. Delegation creation - No plant ownership verification
**File:** `packages/api/src/services/delegation/endpoints/create-delegation.ts:63-92`
```typescript
const plantIds = request.plantIds as string[]
// ... overlap check ...
yield* delegationRepo.addPlants(delegation.id, plantIds)
// Missing: verify all plantIds belong to currentUserId
```
**Impact:** User A can delegate User B's plants to User C, effectively granting unauthorized access to someone else's plants.

**Fix:** After extracting `plantIds`, verify ownership:
```typescript
const plants = yield* plantRepo.findByIds(plantIds)
const allOwned = Array.every(plants, (p) => p.userId === currentUserId)
if (!allOwned) {
  return yield* Effect.fail(new PlantNotAuthorizedError())
}
```

---

### HIGH Severity

#### V6. Achievement unlock - No admin authorization
**File:** `packages/api/src/services/achievements/handlers.ts:19-22`
```typescript
.handle('unlockAchievement', ({ payload }) =>
  achievementsService.unlockAchievement(payload).pipe(withSqlErrorAsDefect)
)
```
**Impact:** Any authenticated user can call `POST /achievements/unlock` and unlock any achievement for themselves without earning it.

**Fix:** Either restrict to admin role, or remove the endpoint entirely and only unlock via the event-based achievement checker.

---

#### V7. RevenueCat webhook - Authentication is optional
**File:** `packages/api/src/services/subscriptions/providers/revenuecat.provider.ts:65-89`
```typescript
const webhookAuthKey = yield* pipe(
  Config.string('REVENUECAT_WEBHOOK_AUTH_KEY'),
  Config.withDefault('')  // Empty default = NO AUTH
)
// ...
if (webhookAuthKey.length > 0) {  // Skipped entirely if key is empty
  // auth check
}
```
**Impact:** If `REVENUECAT_WEBHOOK_AUTH_KEY` is not configured (default), anyone can send forged webhook events to grant themselves premium subscriptions, cancel other users' subscriptions, or trigger billing events.

**Fix:** Remove the `Config.withDefault('')` and make the key mandatory. Fail startup if not configured. Also consider implementing HMAC signature verification.

---

#### V8. No rate limiting on `/auth/refresh`
**File:** `packages/api/src/services/auth/endpoints/refresh-token.ts`

The refresh token endpoint has no rate limiting, unlike `sendMagicLink` (3/60s) and `verifyMagicLink` (5/10s).

**Impact:** An attacker with a stolen refresh token can issue unlimited token refreshes, enabling brute-force attacks on the JWT signing key through timing analysis, or simple denial of service.

**Fix:** Add rate limiting keyed on the user ID from the refresh token:
```typescript
yield* rateLimiter.checkRateLimit(`refresh:${storedToken.userId}`, RATE_LIMITS.REFRESH)
```

---

#### V9. No refresh token rotation
**File:** `packages/api/src/services/auth/endpoints/refresh-token.ts:64-67`

When refreshing, a new access token is issued but the same refresh token remains valid for its full 30-day lifetime.

**Impact:** If a refresh token is stolen, the attacker has a 30-day window to use it. There's no way to detect token compromise through rotation anomalies.

**Fix:** Issue a new refresh token on each refresh, revoke the old one, and implement reuse detection (if old token is used again after rotation, revoke all tokens for the user as a compromise signal).

---

### MEDIUM Severity

#### V10. Diagnosis endpoints - Missing plant ownership check
**Files:**
- `packages/api/src/services/diagnosis/endpoints/get-diagnoses.ts`
- `packages/api/src/services/diagnosis/endpoints/resolve-diagnosis.ts`

While `getDiagnoses` passes `userId` to the repository (which filters by both `plantId` AND `userId`), and `markResolved` also filters by `userId`, there is no verification that the `plantId` in the URL belongs to the authenticated user. This means a user can probe arbitrary `plantId` values - they'll get empty results for plants they don't own, but the lack of consistent authorization is a design weakness.

**Fix:** Add `withPlantAuth(plantId)` to the diagnosis handlers for consistency and defense-in-depth.

---

#### V11. `DISABLE_LIMITS` config flag can bypass all subscription limits
**File:** `packages/api/src/services/subscriptions/limit-checker.ts:43-55`

An environment variable (`DISABLE_LIMITS=true`) completely disables all subscription limit enforcement, returning a no-op checker.

**Impact:** If accidentally enabled in production, all free-tier users get premium features.

**Fix:** Add a guard that prevents `DISABLE_LIMITS` from being set in production environments. Log a strong warning. Consider requiring a compound key (e.g., `DISABLE_LIMITS=true` + `NODE_ENV=development`).

---

#### V12. `waterMultiplePlants` - Soft authorization failure
**File:** `packages/api/src/services/plants/endpoints/water-multiple-plants.ts:67-78`

The endpoint uses `canAccessPlant()` internally but returns `{ success: false }` for unauthorized plants instead of failing. This leaks information about which plant IDs exist.

**Impact:** Low data exposure but inconsistent with the authorization model used by other endpoints.

**Fix:** Either fail the entire request if any plant is unauthorized, or at minimum don't distinguish between "not found" and "not authorized" in the response.

---

#### V13. Magic link TOCTOU race condition
**Files:**
- `packages/api/src/services/auth/endpoints/magic-link-callback.ts` (validates token but doesn't mark used)
- `packages/api/src/services/auth/endpoints/verify-magic-link.ts` (marks used non-atomically)

The magic link callback validates the token without marking it used. The verify endpoint then reads + marks used in two separate operations, creating a time-of-check-time-of-use window.

**Fix:** Use `UPDATE ... WHERE ... AND used_at IS NULL RETURNING *` as an atomic check-and-mark operation.

---

## Proposed Fix Plan

### Phase 1: Critical IDOR Fixes (V1-V5)

These are the highest priority - they allow cross-user data access.

**Step 1: Add `withPlantAuth` to plant handlers**
- File: `packages/api/src/services/plants/handlers.ts`
- Add `withPlantAuth(id)` to `getPlant` handler (line 70)
- Add `withPlantAuth(id)` to `getPlantPhotos` handler (line 89)

**Step 2: Add `withPlantAuth` to care-log handlers**
- File: `packages/api/src/services/care-logs/handlers.ts`
- Add `withPlantAuth(plantId)` to all 5 plant-scoped care-log handlers
- Requires adding `PlantRepository` and `DelegationRepository` to the layer dependencies
- Import `withPlantAuth` from plants helpers

**Step 3: Add plant ownership check to AI chat**
- File: `packages/api/src/services/ai-chat/plant-chat.ts`
- After `plantRepo.findById(plantId)`, add `assertCanAccessPlant(plant.userId, plant.id)`
- Import the helper from plants service

**Step 4: Add plant ownership verification to delegation creation**
- File: `packages/api/src/services/delegation/endpoints/create-delegation.ts`
- After extracting `plantIds`, fetch all plants via `plantRepo.findByIds(plantIds)`
- Verify every plant has `userId === currentUserId`
- Fail with `PlantNotAuthorizedError` if any don't match
- Requires adding `PlantRepository` to the function's dependencies

### Phase 2: High Severity Fixes (V6-V9)

**Step 5: Restrict achievement unlock to admin**
- File: `packages/api/src/services/achievements/handlers.ts`
- Add admin role check, OR remove the endpoint entirely and rely on the automated achievement checker

**Step 6: Make RevenueCat webhook auth mandatory**
- File: `packages/api/src/services/subscriptions/providers/revenuecat.provider.ts`
- Remove `Config.withDefault('')` from `REVENUECAT_WEBHOOK_AUTH_KEY`
- The server will fail to start if the key is not configured, which is the desired behavior

**Step 7: Add rate limiting to refresh token endpoint**
- File: `packages/api/src/services/auth/endpoints/refresh-token.ts`
- Add rate limit check after finding the stored token (so we have the userId)
- Use a reasonable limit (e.g., 10 requests per 60 seconds per user)

**Step 8: Implement refresh token rotation**
- File: `packages/api/src/services/auth/endpoints/refresh-token.ts`
- On successful refresh: generate a new refresh token, store it, revoke the old one
- Return both `accessToken` and `refreshToken` in the response
- Update the shared response schema to include the new refresh token

### Phase 3: Medium Severity Fixes (V10-V13)

**Step 9: Add `withPlantAuth` to diagnosis handlers**
- File: `packages/api/src/services/diagnosis/handlers.ts`
- Add `withPlantAuth(plantId)` to `getDiagnoses` handler

**Step 10: Guard `DISABLE_LIMITS` for production**
- File: `packages/api/src/services/subscriptions/limit-checker.ts`
- Add `NODE_ENV` check: only allow `DISABLE_LIMITS` when `NODE_ENV !== 'production'`
- Log a warning when the flag is active

**Step 11: Harden `waterMultiplePlants` authorization**
- File: `packages/api/src/services/plants/endpoints/water-multiple-plants.ts`
- Change unauthorized plant responses to not distinguish between "not found" and "not authorized"

**Step 12: Make magic link verification atomic**
- File: `packages/api/src/services/auth/endpoints/verify-magic-link.ts`
- Replace the read-then-update pattern with a single atomic `UPDATE ... WHERE token = ? AND used_at IS NULL RETURNING *`
