# Lily Codebase — Code Review & Refactoring Plan

This plan identifies code smells, pattern violations, repeated code, and architectural improvements across all packages, organized by severity and grouped by theme.

---

## Part 1: CLAUDE.md Pattern Violations (Mandatory Fixes)

These are direct violations of the project's own coding rules.

### 1.1 Native `new Date()` / `Date.now()` Usage (FORBIDDEN)

All instances must be replaced with Effect `DateTime` or `@lily/shared` date utilities.

**API package (production code):**
| File | Line(s) | Violation | Fix |
|------|---------|-----------|-----|
| `packages/api/src/repositories/plant.repository.ts` | 489, 520 | `new Date()` | Use `nowAsDate()` from `@lily/shared` |
| `packages/api/src/repositories/weather.repository.ts` | 74, 98 | `new Date()` for cutoff | Use `DateTime.unsafeNow()` + `DateTime.subtract` |
| `packages/api/src/repositories/room.repository.ts` | 96 | `new Date()` in `.set(...)` | Use `nowAsDate()` |
| `packages/api/src/repositories/diagnosis.repository.ts` | 161 | `new Date()` for resolvedAt | Use `nowAsDate()` |
| `packages/api/src/services/delegation-scheduler/scheduler.ts` | 25 | `new Date()` | Use `nowAsDate()` |
| `packages/api/src/services/delegation/endpoints/create-delegation.ts` | 37-39, 112 | `new Date(request.startDate)`, `new Date()` | Use `DateTime.make()` and `nowAsDate()` |
| `packages/api/src/services/delegation/endpoints/respond-delegation.ts` | 49, 78 | `new Date()` | Use `nowAsDate()` |
| `packages/api/src/services/delegation/endpoints/cancel-delegation.ts` | ~line | `new Date()` | Use `nowAsDate()` |
| `packages/api/src/services/delegation/endpoints/complete-delegation.ts` | ~line | `new Date()` | Use `nowAsDate()` |
| `packages/api/src/services/social/endpoints/follow-user.ts` | 74 | `new Date()` | Use `nowAsDate()` |
| `packages/api/src/services/social/endpoints/send-nudge.ts` | 40 | `new Date(Date.now() - oneDayMs)` | Use `DateTime.subtract(DateTime.unsafeNow(), Duration.days(1))` |
| `packages/api/src/services/user/endpoints/upload-avatar.ts` | 43 | `Date.now()` | Use `nowAsEpochMillis()` |
| `packages/api/src/services/weather/endpoints/get-care-adjustments.ts` | 88 | `new Date().toISOString().split('T')[0]` | Use `pipe(nowAsIsoString(), String.split('T'), Array.headNonEmpty)` (already done correctly in `get-weather-context.ts:87`) |
| `packages/api/src/services/weather/providers/openweathermap.provider.ts` | 75, 81 | `new Date(...)` and `.toISOString()` | Use `DateTime.make()` + `toIsoString()` |

**Shared package:**
| File | Line(s) | Violation | Fix |
|------|---------|-----------|-----|
| `packages/shared/src/services/file/gcs.ts` | 157, 184, 266, 304 | `Date.now()` and `new Date()` | Use `nowAsEpochMillis()` and `nowAsDate()` |
| `packages/shared/src/domains/common/date.ts` | 173 | `new Date(parts.year, parts.month, 0).getDate()` | Refactor to use pure DateTime calculation |

### 1.2 `Object.entries()` Usage (FORBIDDEN — use `Record.toEntries`)

| File | Line | Violation | Fix |
|------|------|-----------|-----|
| `packages/api/src/services/notification-scheduler/scheduler.ts` | 153 | `Object.entries(grouped)` in `for...of` | Use `pipe(Record.toEntries(grouped), Array.forEach(...))` |

### 1.3 Native String Methods (Should use Effect `String` module)

| File | Line(s) | Violation | Fix |
|------|---------|-----------|-----|
| `packages/api/src/repositories/magic-link.repository.ts` | 55, 126 | `.toLowerCase().trim()` | `pipe(email, String.toLowerCase, String.trim)` |
| `packages/api/src/services/auth/endpoints/send-magic-link.ts` | 38 | `.toLowerCase().trim()` | Same as above |
| `packages/api/src/services/auth/endpoints/set-username.ts` | 22 | `.trim()` | `String.trim(request.username)` |
| `packages/api/src/services/user/endpoints/upload-avatar.ts` | 43 | `.split('.').pop()` | `pipe(file.name, String.split('.'), Array.last)` |
| `packages/api/src/services/notifications/timezone-scheduler.ts` | 51, 121 | `.split(':')` | `String.split(time, ':')` |
| `packages/api/src/services/weather/cache.live.ts` | 20 | `id.split('_')` | `String.split(id, '_')` |
| `packages/api/src/services/push/expo.provider.ts` | 117 | `.join(', ')` on mapped array | `Array.join(Array.map(invalidTokens, (t) => t.to), ', ')` |
| `packages/api/src/services/jwt/service.ts` | 166 | `.join('')` | `Array.join(arr, '')` |
| `packages/api/src/services/weather/providers/open-meteo.provider.ts` | 36 | `].join(',')` | `Array.join([...], ',')` |
| `packages/shared/src/domains/common/date.ts` | 834 | `.toUpperCase()` | `String.toUpperCase(...)` |
| `packages/shared/src/domains/notification/timezone.ts` | 53 | `time.split(':')` | `String.split(time, ':')` |

### 1.4 Native `.filter()` on Non-Effect Arrays (Production Code)

| File | Line | Violation | Fix |
|------|------|-----------|-----|
| `packages/api/src/repositories/weather.repository.ts` | 93 | `results.filter((r) => ...)` | `Array.filter(results, (r) => ...)` |

### 1.5 Native `.includes()` on Array Literal

| File | Line | Violation | Fix |
|------|------|-----------|-----|
| `packages/api/src/services/notifications/handlers.ts` | 21 | `['pending', 'queued', ...].includes(...)` | `Array.contains(['pending', ...], urlParams.status)` or use `Match` |

### 1.6 `??` (Nullish Coalescing) Patterns That Should Use `Option`

| File | Line(s) | Context | Fix |
|------|---------|---------|-----|
| `packages/api/src/services/notification-scheduler/scheduler.ts` | 100 | `userSettingsMap.get(...) ?? null` | Use `Option.fromNullable(map.get(...))` |
| `packages/api/src/services/notification-scheduler/translations.ts` | 33, 38, 43, 47, 51, 55, 60, 64 | `p.senderName ?? 'Someone'` | Use `Option.getOrElse(Option.fromNullable(p.senderName), () => 'Someone')` |

> **Note:** Some `??` usages (e.g., in database insert helpers converting `undefined` to `null`) are acceptable since they operate at the Drizzle ORM boundary where native types are expected.

### 1.7 Zod Instead of Effect Schema

| File | Lines | Violation | Fix |
|------|-------|-----------|-----|
| `packages/shared/src/services/ai/plant-schema.ts` | 1-54 | Entire file uses Zod (`z.object()`) | Rewrite using Effect `Schema` for consistency |

### 1.8 Native Array Methods in DB Scripts

| File | Line(s) | Violation | Fix |
|------|---------|-----------|-----|
| `packages/db/scripts/migrate.ts` | 34, 39 | `.map()`, `.filter()`, `.sort()` | Use `Array.map`, `Array.filter`, `Array.sort` |
| `packages/db/scripts/seed-demo-data.ts` | 289, 339, 383, 445, 495, 509, 547, 597, 647, 685, 723, 769 | `.find()` x12 | Use `Array.findFirst()` returning `Option<T>` |
| `packages/db/scripts/seed-apple-reviewer.ts` | 210 | `existingUsers[0]` | Use `Array.head(existingUsers)` |
| `packages/db/scripts/seed-admin.ts` | 17 | `.find()` | Use `Array.findFirst()` |

---

## Part 2: Security Issues

### 2.1 SQL Injection Risk — String Interpolation in Raw SQL

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `packages/api/src/repositories/follow.repository.ts` | 260 | `` sql.raw(`ARRAY[${Array.map(userIds, (id) => `'${id}'`).join(',')}]::uuid[]`) `` | Use Drizzle's `inArray()` operator or parameterized `sql.placeholder` |

### 2.2 Unsafe Date Parsing Before Validation

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `packages/api/src/services/delegation/endpoints/create-delegation.ts` | 37-42 | Constructs `new Date(request.startDate)` then checks `Number.isNaN(...)` | Parse with `DateTime.make()` which returns `Option`, then validate |

### 2.3 Fragile URL Parameter Deserialization (App)

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `packages/app/src/screens/add-plant/ManualAddCareNeedsScreen.tsx` | 32 | `JSON.parse(decodeURIComponent(...))` with no error handling | Wrap in try/catch with fallback, or use Effect Schema decode |
| `packages/app/src/screens/add-plant/ManualAddScheduleScreen.tsx` | 59-62 | Multiple unvalidated decodings | Same — add safe parsing utility |

---

## Part 3: Code Smells

### 3.1 Non-Null Assertions Without Validation

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `packages/api/src/services/delegation/endpoints/respond-delegation.ts` | 82 | `return updated!` | Handle possible undefined with `Option` or explicit error |
| `packages/api/src/services/delegation/endpoints/create-delegation.ts` | 115 | `return detail!` | Same |

### 3.2 Mutable State in Functional Codebase

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `packages/api/src/services/weather-scheduler/readjust-care-schedules.ts` | 209-239 | `let wateringChanged`, `let fertilizationChanged`, `let newNextWateringAt` — imperative mutation | Refactor to immutable data flow using `pipe` and `Struct.evolve` or a result record |

### 3.3 Magic Numbers

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `packages/api/src/services/weather/algorithm.ts` | 701-703 | `24 * 60 * 60 * 1000` repeated | Extract `const MS_PER_DAY = Duration.toMillis(Duration.days(1))` |
| `packages/api/src/services/weather/algorithm.ts` | 115+ | Hardcoded coefficients like `0.7`, `0.15` | Extract named constants with documentation |
| `packages/shared/src/domains/common/date.ts` | 376-383 | `minutes < 1`, `hours < 24`, `days < 7` | Use `Duration` module comparisons |

### 3.4 Inconsistent `parseInt` Parsing

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `packages/api/src/services/notifications/handlers.ts` | 19-20 | `parseInt(urlParams.page, 10) \|\| 1` — fragile fallback | Use Effect Schema or `Number.parse` with proper validation |

---

## Part 4: Repeated Code / Duplication

### 4.1 Notification Scheduling Pattern (Duplicated 5+ Times)

The following pattern is repeated across multiple endpoints:

```typescript
yield* messageQueue.enqueue('notification', {
  type: '...',
  userId: ...,
  data: { ... },
  scheduledAt: new Date(),
})
```

**Files:**
- `packages/api/src/services/social/endpoints/follow-user.ts:69-75`
- `packages/api/src/services/delegation/endpoints/respond-delegation.ts:73-79`
- `packages/api/src/services/delegation/endpoints/create-delegation.ts:107-113`
- `packages/api/src/services/social/endpoints/send-nudge.ts`
- `packages/api/src/services/delegation/endpoints/cancel-delegation.ts`

**Fix:** Extract a `scheduleNotification(queue, type, userId, data)` helper in `packages/api/src/services/helpers/`.

### 4.2 Delegation Scheduler — Identical Activate/Complete Processing

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `packages/api/src/services/delegation-scheduler/scheduler.ts` | 28-60 vs 68-102 | Nearly identical logic for `toActivate` and `toComplete` | Extract `processDelegationBatch(delegations, newStatus, handler)` helper |

### 4.3 Skeleton Loaders Defined Locally in Multiple Screens (App)

Instead of reusable components, each screen defines its own inline skeleton:

| File | Component |
|------|-----------|
| `packages/app/src/screens/home/HomeScreen.tsx:26` | `HomeContentSkeleton` |
| `packages/app/src/screens/plants/PlantsScreen.tsx:103` | `PlantCardSkeleton` |
| `packages/app/src/screens/care/CareScreen.tsx:69` | `CareTaskCardSkeleton` |
| `packages/app/src/screens/rooms/RoomsScreen.tsx:56` | `RoomCardSkeleton` |
| `packages/app/src/screens/log-care/components/PlantSelector.tsx` | `PlantSelectorSkeleton` |
| `packages/app/src/screens/delegation-create/components/PlantSelector.tsx` | `PlantSelectorSkeleton` |

**Fix:** Create `packages/app/src/components/skeletons/` directory with shared skeleton components.

### 4.4 Duplicated PlantSelector Component

| File | Context |
|------|---------|
| `packages/app/src/screens/log-care/components/PlantSelector.tsx` | BottomSheet with search for care logging |
| `packages/app/src/screens/delegation-create/components/PlantSelector.tsx` | Similar BottomSheet for delegation creation |

**Fix:** Extract a shared `PlantSelectorSheet` component with customizable props.

### 4.5 Repeated `parseApiDate → Option.map → Option.getOrElse` Pattern (Shared)

In `packages/shared/src/domains/common/date.ts`, this pattern appears 15+ times:

```typescript
pipe(
  parseApiDate(dateInput),
  Option.map(someFormatter),
  Option.getOrElse(() => defaultValue)
)
```

**Fix:** Create a higher-order function:
```typescript
const formatApiDateWith = <A>(formatter: (dt: DateTime.Utc) => A, defaultValue: A) =>
  (dateInput: string | null | undefined): A =>
    pipe(parseApiDate(dateInput), Option.map(formatter), Option.getOrElse(() => defaultValue))
```

### 4.6 Duplicated `SelectedUser` Type (App)

| File | Lines |
|------|-------|
| `packages/app/src/screens/delegation-create/DelegationCreateScreen.tsx` | 24-27 |
| `packages/app/src/screens/delegation-create/components/CaretakerPicker.tsx` | 40-43 |

**Fix:** Extract to `packages/app/src/screens/delegation-create/types.ts`.

---

## Part 5: Architectural Improvements

### 5.1 Split `date.ts` (904 Lines) Into Focused Modules

`packages/shared/src/domains/common/date.ts` is 904 lines with 60+ exported functions.

**Fix:** Split into:
- `date/parse.ts` — `parseApiDate`, `toIsoString`, `toNativeDate`, `fromEpochMillis`
- `date/format.ts` — `formatDate`, `formatTime`, `formatRelativeTime`, `formatShortDate`, `formatDayOfWeek`, etc.
- `date/compare.ts` — `isToday`, `isOverdue`, `isFuture`, `isThisWeek`, `daysUntil`, `daysUntilApiDate`
- `date/timezone.ts` — `withTimeZone`, `startOfDay`, `endOfDay`, `endOfMonth`
- `date/index.ts` — Re-export everything

### 5.2 Split `algorithm.ts` (777 Lines) Into Composable Functions

`packages/api/src/services/weather/algorithm.ts` is a single monolithic module.

**Fix:** Extract into:
- `algorithm/et0.ts` — ET₀ calculation (Penman-Monteith)
- `algorithm/adjustment.ts` — Care adjustment calculation
- `algorithm/coefficients.ts` — Named constants and coefficient lookup tables
- `algorithm/index.ts` — Re-export `calculatePlantAdjustment`

### 5.3 Decompose Large Screen Components (App)

| Component | Lines | Suggested Extraction |
|-----------|-------|---------------------|
| `NotificationSettingsScreen.tsx` | 704 | Extract `TimezonePicker`, `TimePickerModal`, `NotificationToggle` |
| `RoomsScreen.tsx` | 576 | Extract `RoomEditSheet`, `EmojiPicker`, `LuminosityPicker`, `PlantAssigner` |
| `PlantDetailScreen.tsx` | 562 | Extract `PlantHeroSection`, `CareScheduleCard`, `IdealEnvironmentCard` |
| `PlantsScreen.tsx` | 481 | Extract `PlantFilterBar`, `PlantSortControls`, `PlantSearchHeader` |
| `EditPlantScreen.tsx` | 474 | Extract form sections into sub-components |
| `CareScreen.tsx` | 436 | Extract `TaskSection`, `UndoToast`, `DelegationBanner` |

### 5.4 Refactor `plant.repository.ts:findAll` (Complex 150-Line Method)

The `findAll` method (lines 178-330) has:
- Multiple nested conditions for filter/room/pagination
- Duplicated query logic for owned vs. caretaking plants
- Hard to follow branching

**Fix:** Extract into:
- `buildPlantQuery(filters)` — Returns typed Drizzle query builder
- `buildPaginationClause(page, limit)` — Pagination logic
- `mergeOwnedAndCaretaking(owned, caretaking)` — Combine results

### 5.5 Add Missing Database Indexes

Performance-critical queries are missing indexes:

| Table | Column(s) | File | Reason |
|-------|-----------|------|--------|
| `plants` | `userId` | `packages/db/src/schema/plants.ts` | Every plant query filters by user |
| `plants` | `roomId` | `packages/db/src/schema/plants.ts` | Room-based queries |
| `notifications` | `userId` | `packages/db/src/schema/notifications.ts` | Notification listing by user |
| `notifications` | `status` | `packages/db/src/schema/notifications.ts` | Notification polling by status |
| `chatMessages` | `(userId, plantId)` | `packages/db/src/schema/chat.ts` | Composite index for chat lookups |
| `careLogs` | `plantId` | `packages/db/src/schema/plant-history.ts` | Care history by plant |
| `plantScans` | `userId` | `packages/db/src/schema/plant-history.ts` | Achievement tracking |

### 5.6 Standardize Enum Casing in DB Schema

`packages/db/src/schema/enums.ts` has inconsistent casing:
- UPPER_CASE: `plantHealthEnum`, `diagnosisSeverityEnum`, `diagnosisStatusEnum`
- lowercase: `careLogTypeEnum`, `notificationStatusEnum`, `delegationStatusEnum`, `userRoleEnum`, `userStatusEnum`

**Fix:** Standardize on lowercase for all enums (requires migration).

### 5.7 Add Missing `$onUpdate()` for `updatedAt` Columns

| Table | File | Issue |
|-------|------|-------|
| `plants` | `packages/db/src/schema/plants.ts:27` | Missing `.$onUpdate(() => new Date())` on `updatedAt` |

Other tables (like `diagnoses`, `delegation`) have it correctly.

### 5.8 Add Missing Relation Definitions (DB)

| Table | File | Issue |
|-------|------|-------|
| `magicLinks` | `packages/db/src/schema/auth.ts` | No relations exported (unlike `refreshTokens`) |
| `weatherSnapshots` | `packages/db/src/schema/weather.ts` | No relations exported |

### 5.9 Batch N+1 Queries in Weather Scheduler

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `packages/api/src/services/weather-scheduler/readjust-care-schedules.ts` | 123 | `Effect.forEach(plantsResult.items, (plant) => readjustPlantSchedule(...))` — each plant is a separate DB call | Batch updates using a single transaction or `Effect.forEach` with `{ concurrency: 10 }` |

### 5.10 Add `useMemo` for Expensive Render Calculations (App)

| File | Location | Issue |
|------|----------|-------|
| `packages/app/src/screens/plants/PlantsScreen.tsx` | ~line 150 | Inline filter/sort in render without memoization |
| `packages/app/src/screens/care/CareScreen.tsx` | ~line 180 | Task grouping logic (`groupedBySection`) recalculates every render |
| `packages/app/src/screens/notification-settings/NotificationSettingsScreen.tsx` | ~line 84 | `formatTimeDisplay()` defined inside component, not memoized |

### 5.11 Standardize Loading Patterns (App)

Some screens use `ActivityIndicator` instead of the skeleton pattern mandated in the app's CLAUDE.md:

| File | Line | Issue |
|------|------|-------|
| `packages/app/src/screens/profile/ProfileScreen.tsx` | ~54 | Bare `ActivityIndicator` |
| `packages/app/src/screens/plant-detail/PlantDetailScreen.tsx` | ~73 | `ActivityIndicator` inside skeleton |

**Fix:** Replace with proper delayed skeleton loaders using `useDelayedLoading`.

### 5.12 Inconsistent Naming: `dateAdded` vs `createdAt`

| Table | File | Column Name | Convention |
|-------|------|-------------|-----------|
| `plants` | `packages/db/src/schema/plants.ts:24` | `dateAdded` | Should be `createdAt` |
| All other tables | Various | `createdAt` | ✅ Correct |

**Fix:** Rename via migration (breaking change — requires coordinated update across API, shared, and app).

---

## Summary: Priority Order

| Priority | Category | Items |
|----------|----------|-------|
| **P0 — Security** | SQL injection in follow.repository | 1 |
| **P1 — CLAUDE.md Violations** | `new Date()`, `Object.entries`, native string/array methods, Zod usage | ~40 instances |
| **P2 — Code Smells** | Non-null assertions, mutable state, magic numbers, unsafe parsing | ~10 issues |
| **P3 — Duplication** | Notification helper, skeleton components, PlantSelector, date formatting HOF | 6 patterns |
| **P4 — Architecture** | Split large files, decompose screens, add DB indexes, batch queries | 12 improvements |
| **P5 — Consistency** | Enum casing, `dateAdded` naming, loading patterns, missing relations | 5 items |
