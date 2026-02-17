# Lily - Global Coding Rules

This document defines the global coding rules that apply to **all packages** in the Lily monorepo. Package-specific architecture is documented in each package's own `CLAUDE.md`.

> **See also:**
> - `CONTRIBUTING.md` - Development workflow and commands
> - `.claude/ARCHITECTURE.md` - Codebase map and navigation
> - `packages/*/CLAUDE.md` - Package-specific architecture

## Project Overview

Lily is a plant care management application built as a TypeScript monorepo using Bun. It consists of:
- **api** - Backend API server (Effect Platform)
- **db** - Drizzle ORM schema and migrations
- **shared** - Shared types, schemas, and utilities
- **app** - React Native mobile app (Expo)

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **API Framework**: Effect Platform with Effect.js
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod + Effect Schema
- **Mobile**: React Native with Expo
- **Build System**: Turborepo (cached builds)
- **Linting**: Biome
- **Testing**: Vitest

---

## Code Conventions

### Formatting (Biome)

- 2-space indentation
- Single quotes
- No semicolons
- 80-character line width
- ES5 trailing commas

### Imports

**NEVER use relative imports or bare `src/` prefix.** Always use the `@/` path alias for internal app imports.

```typescript
// ❌ FORBIDDEN - Relative imports
import { Avatar } from '../components/Avatar'
import { useAuth } from '../../contexts/AuthContext'

// ❌ FORBIDDEN - Bare src/ prefix
import { Avatar } from 'src/components/Avatar'
import { useAuth } from 'src/contexts/AuthContext'

// ✅ REQUIRED - @/ alias (maps to src/)
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/contexts/AuthContext'
```

Cross-package imports use their package name (e.g. `@lily/shared`, `@lily/api`).

---

## Effect.js Patterns (MANDATORY)

This codebase uses Effect.js for functional programming. **Always prefer Effect utilities over native JavaScript methods** for composition, iteration, mapping, filtering, and pattern matching.

### Generator Syntax

```typescript
Effect.gen(function* () {
  const repo = yield* PlantRepository
  const data = yield* repo.findById(id)
  return data
})
```

### Effect Utilities

```typescript
// Mapping - use Effect.map
Effect.map(effect, (value) => transform(value))

// Chaining - use Effect.flatMap
Effect.flatMap(effect, (value) => anotherEffect(value))

// Iteration with effects - use Effect.forEach
Effect.forEach(items, (item) => processItem(item))

// Parallel execution - use Effect.all
Effect.all([effectA, effectB, effectC])

// Pattern matching - use Match for exhaustive checks
import { Match } from 'effect'
const handler = Match.type<MyUnion>().pipe(
  Match.when('case1', () => handleCase1()),
  Match.when('case2', () => handleCase2()),
  Match.exhaustive
)
```

---

## Strict Effect-First Rules (MANDATORY)

**This codebase enforces Effect utilities everywhere. Native JavaScript methods are PROHIBITED.**

### Prohibited Native Methods

The following are **FORBIDDEN** and must never be used:

- Array methods: `.map()`, `.filter()`, `.reduce()`, `.find()`, `.findIndex()`, `.forEach()`, `.some()`, `.every()`, `.includes()`, `.flat()`, `.flatMap()`
- Object methods: `Object.keys()`, `Object.values()`, `Object.entries()`
- Control flow: `switch` statements (use `Match` instead)
- Nullable patterns: ternary operators for null checks, `??` for Option-like patterns
- Nested ternaries: use `Match` module instead for multi-condition branching

### Required Effect Replacements

| Native JS | Effect Replacement |
|-----------|-------------------|
| `arr.map(fn)` | `Array.map(arr, fn)` or `pipe(arr, Array.map(fn))` |
| `arr.filter(fn)` | `Array.filter(arr, fn)` |
| `arr.reduce(fn, init)` | `Array.reduce(arr, init, fn)` |
| `arr.find(fn)` | `Array.findFirst(arr, fn)` → returns `Option<T>` |
| `arr[0]` | `Array.head(arr)` → returns `Option<T>` |
| `arr[arr.length - 1]` | `Array.last(arr)` → returns `Option<T>` |
| `arr.forEach(fn)` | `Array.forEach(arr, fn)` or `Effect.forEach` |
| `arr.some(fn)` | `Array.some(arr, fn)` |
| `arr.every(fn)` | `Array.every(arr, fn)` |
| `arr.includes(x)` | `Array.contains(arr, x)` |
| `arr.flat()` | `Array.flatten(arr)` |
| `arr.flatMap(fn)` | `Array.flatMap(arr, fn)` |
| `Object.keys(obj)` | `Record.keys(obj)` |
| `Object.values(obj)` | `Record.values(obj)` |
| `Object.entries(obj)` | `Record.toEntries(obj)` |
| `{ ...obj, key: val }` | `Struct.evolve(obj, { key: () => val })` |
| `x ?? defaultVal` | `Option.getOrElse(option, () => defaultVal)` |
| `x != null ? x : y` | `Option.match(option, { onNone: () => y, onSome: (x) => x })` |
| `switch (x._tag)` | `Match.type<T>().pipe(Match.when(...), Match.exhaustive)` |
| `if/else chains` | `Match` module for complex branching |
| `a ? x : b ? y : z` | `Match.value(val).pipe(Match.when(...), Match.orElse(...))` |
| `str.toUpperCase()` | `String.toUpperCase(str)` |
| `str.includes(x)` | `String.includes(str, x)` |
| `str.split(x)` | `String.split(str, x)` |

### Effect Modules Reference

Always import and use these Effect modules:

```typescript
import {
  Array,      // Array operations (map, filter, reduce, head, etc.)
  Record,     // Object operations (keys, values, map, filter)
  Option,     // Nullable handling (Some, None, getOrElse)
  Either,     // Error handling (Left, Right)
  Match,      // Pattern matching (exhaustive)
  Struct,     // Object manipulation (pick, omit, evolve)
  String,     // String operations (toUpperCase, includes, etc.)
  Number,     // Number utilities
  Predicate,  // Type guards (isString, isNumber, etc.)
  pipe,       // Function composition
  flow,       // Point-free function composition
  Effect,     // Effectful operations
} from 'effect'
```

### Code Examples

**Array transformations:**
```typescript
// ❌ FORBIDDEN - Native JS
const names = users.map(u => u.name)
const active = users.filter(u => u.isActive)
const first = users[0]
const found = users.find(u => u.id === id)

// ✅ REQUIRED - Effect
const names = Array.map(users, (u) => u.name)
const active = Array.filter(users, (u) => u.isActive)
const first = Array.head(users) // Option<User>
const found = Array.findFirst(users, (u) => u.id === id) // Option<User>
```

**Pattern matching (replace switch):**
```typescript
// ❌ FORBIDDEN - Switch statements
switch (action._tag) {
  case 'Create': return handleCreate()
  case 'Update': return handleUpdate()
  default: throw new Error('Unknown')
}

// ✅ REQUIRED - Match module
pipe(
  Match.type<Action>(),
  Match.when({ _tag: 'Create' }, () => handleCreate()),
  Match.when({ _tag: 'Update' }, () => handleUpdate()),
  Match.exhaustive
)(action)
```

**Nullable handling:**
```typescript
// ❌ FORBIDDEN - Nullable handling
const value = maybeValue ?? 'default'
const result = user ? user.name : 'Anonymous'

// ✅ REQUIRED - Option module
const value = Option.getOrElse(maybeOption, () => 'default')
const result = Option.match(maybeUser, {
  onNone: () => 'Anonymous',
  onSome: (user) => user.name,
})
```

**Object operations:**
```typescript
// ❌ FORBIDDEN - Native Object methods
const keys = Object.keys(config)
const values = Object.values(config)
const updated = { ...user, name: 'New Name' }

// ✅ REQUIRED - Record and Struct modules
const keys = Record.keys(config)
const values = Record.values(config)
const updated = Struct.evolve(user, { name: () => 'New Name' })
```

**Nested ternaries (use Match instead):**
```typescript
// ❌ FORBIDDEN - Nested ternaries
const style = segment.bold
  ? { fontFamily: 'Bold' }
  : segment.italic
    ? { fontStyle: 'italic' }
    : undefined

// ✅ REQUIRED - Match module
const style = pipe(
  Match.value(segment),
  Match.when({ bold: true }, () => ({ fontFamily: 'Bold' })),
  Match.when({ italic: true }, () => ({ fontStyle: 'italic' })),
  Match.orElse(() => undefined)
)
```

---

## Date Handling (MANDATORY)

**NEVER use native JavaScript Date methods directly.** Always use Effect's DateTime module or the shared date utilities in `@lily/shared`.

### Prohibited Patterns

The following native Date patterns are **FORBIDDEN**:

- `new Date()` - Use `DateTime.unsafeNow()` or shared `now()`
- `Date.now()` - Use `DateTime.unsafeNow()` then `DateTime.toEpochMillis()`
- `new Date(isoString)` - Use `DateTime.make()` or shared `parseApiDate()`
- `date.getTime() - other.getTime()` - Use `DateTime.distance()`
- `date.getDay()` / `date.getMonth()` etc. - Use `DateTime.toParts()`
- Manual day calculations like `ms / (1000*60*60*24)` - Use `Duration` module

### Required Effect Replacements

| Native JS | Effect Replacement |
|-----------|-------------------|
| `new Date()` | `DateTime.unsafeNow()` |
| `new Date(isoString)` | `DateTime.make(isoString)` → returns `Option<DateTime>` |
| `date.getTime() - other.getTime()` | `DateTime.distance(dt1, dt2)` → returns milliseconds |
| `Math.ceil(ms / (1000*60*60*24))` | `Duration.toDays(Duration.millis(ms))` |
| `date.getDay()` | `DateTime.toParts(dt).weekDay` |
| `date.getMonth()` | `DateTime.toParts(dt).month` |

### Shared Date Utilities (`@lily/shared`)

For common date operations, prefer the shared utilities:

```typescript
import {
  parseApiDate,           // Parse ISO string → Option<DateTime>
  now,                    // Get current time as DateTime.Utc
  nowAsDate,              // Get current time as native Date (for interop)
  nowAsEpochMillis,       // Get current time as epoch milliseconds
  nowAsIsoString,         // Get current time as ISO string
  daysUntil,              // Days until a DateTime (positive=future, negative=past)
  daysUntilApiDate,       // Parse + calculate days (convenience)
  formatDayOfWeek,        // "Monday"
  formatDayOfWeekShort,   // "Mon"
  formatNextDate,         // "Next: Monday"
  formatRelativeTime,     // "2h ago", "Yesterday"
  formatTime,             // "2:30 PM"
  formatShortDate,        // "Mon, Jan 15"
  isToday,                // Check if DateTime is today
  isOverdue,              // Check if DateTime is in the past
  isFuture,               // Check if DateTime is in the future
} from '@lily/shared'
```

### Timezone Handling

1. **API dates are UTC** - Parse with `DateTime.make()` or `parseApiDate()`
2. **Display in user timezone** - Use `DateTime.setZone()` with user's IANA timezone
3. **Store as UTC** - Always store dates in UTC format in database
4. **User timezone stored** - Access from user settings, default to 'UTC'

---

## Important Rules

1. **Never use userId path parameters** — Always use `CurrentUser` from the auth middleware to identify the authenticated user. Do not accept userId in URL paths.
2. **Always use Effect patterns** - Don't mix Promise-based code with Effect code
3. **NEVER use native array methods** - Always use Effect's Array module
4. **NEVER use switch statements** - Always use Match module with `Match.exhaustive`
5. **NEVER use null/undefined directly** - Wrap in Option and use Option utilities
6. **NEVER use nested ternaries** - Use Match module with `Match.when` and `Match.orElse` for multi-condition branching
7. **ALWAYS use pipe()** - For all data transformations, use `pipe()` for composition
8. **Use Effect.gen for effects** - Use `Effect.gen` for effectful sequences, `pipe` for pure transformations
9. **Type safety** - Leverage Effect Schema for runtime validation
10. **Layer composition** - Properly provide all dependencies via Layers
11. **Error propagation** - Use typed errors that flow through the Effect system
12. **Exhaustive matching** - Use `Match.exhaustive` for union types to catch missing cases
13. **No semicolons** - Biome enforces this automatically
14. **Single quotes** - Use single quotes for strings

---

## Testing Commands

| Package | Command | Notes |
|---------|---------|-------|
| **api** | `bun run test` | Vitest with Effect mocks |
| **shared** | `bun run test` | Vitest |
| **app** | `bun run test` | Jest |

### Running Tests

```bash
# From package directory
cd packages/api && bun run test
cd packages/shared && bun run test
cd packages/app && bun run test

# Run specific test file
bun run test my-test-file

# Run with coverage
bun run test --coverage
```

---

## Effect Documentation

An Effect documentation MCP server is available for reference. Use it to:
- Look up Effect module APIs (Array, Option, Match, Record, Struct, DateTime, Duration, etc.)
- Find correct function signatures and usage patterns
- Discover available utilities for any Effect module
