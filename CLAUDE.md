# Agent Instructions for Lily

This document provides instructions for AI assistants working with the Lily codebase.

## Project Overview

Lily is a plant care management application built as a TypeScript monorepo using Bun. It consists of a backend API, database layer, shared utilities, and a React Native mobile app.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **API Framework**: Effect Platform with Effect.js
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod + Effect Schema
- **Mobile**: React Native with Expo
- **Linting**: Biome
- **Testing**: Vitest

## Monorepo Structure

```
packages/
├── api/      # Backend API server (Effect RPC)
├── db/       # Drizzle ORM schema and migrations
├── shared/   # Shared types, schemas, and utilities
└── app/      # React Native mobile app (Expo)
```

## Common Commands

```bash
# Development
bun run dev              # Start all packages in dev mode
bun run build            # Build all packages

# Linting
bun run lint             # Check all packages
bun run lint:fix         # Auto-fix issues

# Testing
bun run test             # Run all tests

# Database
bun run db:generate      # Generate Drizzle migrations
bun run db:push          # Push schema to database
bun run db:migrate       # Run pending migrations
bun run db:studio        # Open Drizzle Studio
```

## Code Conventions

### Formatting (Biome)

- 2-space indentation
- Single quotes
- No semicolons
- 80-character line width
- ES5 trailing commas

## Imports

Imports should always be absolute imports (with @). Never use relative imports

### Effect.js Patterns

This codebase uses Effect.js for functional programming. **Always prefer Effect utilities over native JavaScript methods** for composition, iteration, mapping, filtering, and pattern matching.

**Generator syntax for Effects:**
```typescript
Effect.gen(function* () {
  const repo = yield* PlantRepository
  const data = yield* repo.findById(id)
  return data
})
```

**Use Effect utilities instead of native JS:**
```typescript
// Mapping - use Effect.map
Effect.map(effect, (value) => transform(value))

// Chaining - use Effect.flatMap
Effect.flatMap(effect, (value) => anotherEffect(value))

// Iteration with effects - use Effect.forEach
Effect.forEach(items, (item) => processItem(item))

// Parallel execution - use Effect.all
Effect.all([effectA, effectB, effectC])

// Filtering with effects - use Effect.filter
Effect.filter(items, (item) => Effect.succeed(item.isActive))

// Pattern matching - use Match for exhaustive checks
import { Match } from 'effect'
const handler = Match.type<MyUnion>().pipe(
  Match.when('case1', () => handleCase1()),
  Match.when('case2', () => handleCase2()),
  Match.exhaustive // Compile + runtime exhaustiveness check
)
```

**Use Effect's Array module for pure transformations:**
```typescript
import { Array } from 'effect'

// Instead of native .map/.filter/.reduce
Array.map(items, transform)
Array.filter(items, predicate)
Array.reduce(items, initial, reducer)
Array.head(items)  // Option<T> instead of T | undefined
Array.findFirst(items, predicate)
```

**Service definition:**
```typescript
export class MyService extends Effect.Service<MyService>()('MyService', {
  effect: Effect.gen(function* () {
    const dep = yield* SomeDependency
    return {
      myMethod: () => Effect.succeed('result'),
    }
  }),
}) {}
```

**Layer composition:**
```typescript
Layer.provide(MyServiceLive),
Layer.provide(RepositoryLive),
```

### Repository Pattern

Repositories handle database operations and are injected via Effect Layers:

```typescript
// Define interface
export interface IPlantRepository {
  findById: (id: string) => Effect.Effect<Plant, PlantNotFoundError>
}

// Create context tag
export class PlantRepository extends Context.Tag('PlantRepository')<
  PlantRepository,
  IPlantRepository
>() {}

// Implement live layer
export const PlantRepositoryLive = Layer.effect(
  PlantRepository,
  Effect.gen(function* () {
    const db = yield* DrizzleClient
    return {
      findById: (id) => // implementation
    }
  })
)
```

### API Endpoint Definition

Endpoints use Effect Platform's HttpApiEndpoint:

```typescript
HttpApiEndpoint.get('findPlants', '/plants')
  .addSuccess(Schema.Array(Plant))
  .addError(DatabaseError, { status: 500 })
```

### Handler Implementation

```typescript
export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    Effect.gen(function* () {
      const service = yield* PlantsService
      return handlers
        .handle('findPlants', () => service.findPlants())
        .handle('createPlant', ({ payload }) => service.createPlant(payload))
    })
  ).pipe(
    Layer.provide(PlantsService.Default),
    Layer.provide(PlantRepositoryLive)
  )
```

### Domain Structure

Each domain in `packages/shared/src/domains/` follows this structure:

```
domain/
├── schema.ts      # Zod/Effect schemas
├── errors.ts      # Domain-specific errors
└── selectors.ts   # Data projection functions (optional)
```

### Error Handling

Define typed errors using Schema.TaggedError:

```typescript
export class PlantNotFoundError extends Schema.TaggedError<PlantNotFoundError>()(
  'PlantNotFoundError',
  { id: Schema.String }
) {}
```

## Testing Guidelines

**Tests are mandatory when writing any new feature or endpoint.** Every new endpoint must have corresponding tests before it can be considered complete.

### Test Structure

Tests are centralized in `packages/api/src/__tests__/`:

```
packages/api/src/__tests__/
├── setup.ts                    # Global test setup
├── fixtures/                   # Reusable test data
│   ├── users.ts
│   ├── plants.ts
│   └── care-logs.ts
├── mocks/                      # Mock repository layers
│   ├── user.repository.ts
│   ├── plant.repository.ts
│   └── care-log.repository.ts
└── services/                   # Test files by domain
    ├── user/
    │   ├── find-users.test.ts
    │   ├── find-user-by-id.test.ts
    │   ├── create-user.test.ts
    │   ├── update-user.test.ts
    │   └── delete-user.test.ts
    ├── plants/
    │   └── ...
    └── care-logs/
        └── ...
```

### Mock Pattern

Mock at the **Repository level**, not at the database level. This leverages Effect's DI properly:

```typescript
// __tests__/mocks/user.repository.ts
export const createMockUserRepository = (
  users: User[]
): Layer.Layer<UserRepository> => {
  const repo: IUserRepository = {
    findAll: () => Effect.succeed(users),
    findById: (id) => Effect.succeed(users.find(u => u.id === id) ?? null),
    // ... other methods
  }
  return Layer.succeed(UserRepository, repo)
}
```

### Writing Tests

```typescript
// __tests__/services/user/find-user-by-id.test.ts
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { findUserById } from '@lily/api/services/user/endpoints/find-user-by-id'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('findUserById', () => {
  it('should return user when found', async () => {
    const result = await Effect.runPromise(
      findUserById('user-1').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )
    expect(result).toEqual(mockUsers[0])
  })

  it('should fail with UserNotFoundError when not found', async () => {
    const result = await Effect.runPromiseExit(
      findUserById('non-existent').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )
    expect(result._tag).toBe('Failure')
  })
})
```

### Test Commands

```bash
bun test                    # Run all tests
bun test --watch            # Watch mode
```

### Adding Tests for New Features

When adding a new domain/service:

1. Create fixtures in `__tests__/fixtures/{domain}.ts`
2. Create mock repository in `__tests__/mocks/{domain}.repository.ts`
3. Create test files in `__tests__/services/{domain}/`
4. Test all CRUD operations and error cases

## Database

- ORM: Drizzle ORM
- Schema location: `packages/db/src/schema.ts`
- Migrations: `packages/db/drizzle/`
- Use UUIDs for primary keys
- Always include `createdAt` and `updatedAt` timestamps

## Important Notes

1. **Always use Effect patterns** - Don't mix Promise-based code with Effect code
2. **Prefer Effect utilities** - Use Effect.map, Effect.forEach, Effect.all, Match, and the Array module instead of native JS methods
3. **Type safety** - Leverage Effect Schema for runtime validation
4. **Layer composition** - Properly provide all dependencies via Layers
5. **Error propagation** - Use typed errors that flow through the Effect system
6. **Exhaustive matching** - Use `Match.exhaustive` for union types to catch missing cases at compile and runtime
7. **No semicolons** - Biome enforces this automatically
8. **Single quotes** - Use single quotes for strings
9. **Use bunx, not npx** - Always use `bunx` instead of `npx` for running CLI tools (e.g., `bunx tsc --build` for type checking)
