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
# Docker Services
docker-compose up -d                    # Start all services (postgres, redis, api)
docker-compose up -d postgres redis     # Start only infrastructure services
docker-compose down                     # Stop all services
docker-compose down -v                  # Stop and remove volumes
docker-compose logs -f api              # Follow API logs
docker-compose ps                       # Show service status

# Development (with Docker services running)
bun run dev                             # Start all packages in dev mode
bun run build                           # Build all packages

# Database (with Docker postgres running)
docker-compose exec postgres psql -U lily -d lily   # Connect to database
bun run db:generate                     # Generate Drizzle migrations
bun run db:push                         # Push schema to database
bun run db:migrate                      # Run pending migrations
bun run db:studio                       # Open Drizzle Studio

# Testing
docker-compose up -d postgres-test      # Start test database
bun run test                            # Run all tests
bun run test:integration                # Run integration tests

# Linting
bun run lint                            # Check all packages
bun run lint:fix                        # Auto-fix issues
```

## Docker Infrastructure

The project uses Docker Compose for local development with these services:

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | Development database |
| postgres-test | 5433 | Test database |
| redis | 6379 | Caching/session storage |
| api | 3000 | Application server |

**Database Credentials:**
- User: `lily`
- Password: `lily123`
- Database: `lily` (dev) / `lily_test` (test)

## Codebase Map

### Package Entry Points

| Package | Entry Point | Purpose |
|---------|-------------|---------|
| api | `src/index.ts` | Server bootstrap, layer composition |
| api | `src/api.ts` | API group composition |
| db | `src/index.ts` | DrizzleLive export, schema re-exports |
| shared | `src/index.ts` | All domain schemas and service abstractions |

### API Services (`packages/api/src/services/`)

| Domain | Path | Key Endpoints |
|--------|------|---------------|
| auth | `services/auth/` | magic-link, verify, sign-out, refresh-token |
| plants | `services/plants/` | CRUD, water, fertilize, photos, ai-identify |
| care-logs | `services/care-logs/` | CRUD for care history |
| user | `services/user/` | settings management |
| subscriptions | `services/subscriptions/` | billing, limits, usage tracking |
| notifications | `services/notifications/` | push notifications, scheduler |
| achievements | `services/achievements/` | gamification, event-driven unlocks |
| ai-chat | `services/ai-chat/` | plant care chat assistant |
| admin | `services/admin/` | user management (role-protected) |
| device-tokens | `services/device-tokens/` | push token registration |

### Repositories (`packages/api/src/repositories/`)

| Repository | File | Domain |
|------------|------|--------|
| UserRepository | `user.repository.ts` | User CRUD |
| PlantRepository | `plant.repository.ts` | Plants, photos |
| CareLogRepository | `care-log.repository.ts` | Care history |
| AchievementRepository | `achievement.repository.ts` | Achievements |
| NotificationRepository | `notification.repository.ts` | Notifications |
| ChatRepository | `chat.repository.ts` | AI chat history |
| SubscriptionRepository | `subscription.repository.ts` | Subscriptions |
| DeviceTokenRepository | `device-token.repository.ts` | Push tokens |

### Domain Schemas (`packages/shared/src/domains/`)

| Domain | Files | Key Exports |
|--------|-------|-------------|
| plant | `schema.ts`, `errors.ts`, `selectors.ts` | Plant, PlantPhoto, PlantNotFoundError |
| user | `schema.ts`, `errors.ts` | User, UserSettings |
| auth | `schema.ts` | LoginRequest, Session, Token |
| care-log | `schema.ts`, `errors.ts` | CareLog, CareLogType |
| subscriptions | `schema.ts`, `errors.ts` | Plan, Usage, LimitExceededError |
| achievement | `schema.ts`, `definitions.ts` | Achievement, AchievementDefinition |
| notification | `schema.ts`, `errors.ts` | Notification, NotificationPrefs |
| common | `errors.ts`, `pagination.ts` | DatabaseError, PaginatedResponse |

### Database Schema (`packages/db/src/schema/`)

| File | Tables |
|------|--------|
| `users.ts` | users (profiles, roles) |
| `auth.ts` | magic_links, sessions, refresh_tokens |
| `plants.ts` | plants, plant_photos |
| `plant-history.ts` | plant_history (care events) |
| `care-logs.ts` | care_logs |
| `notifications.ts` | notifications, device_tokens |
| `achievements.ts` | achievements, user_achievements |
| `chat.ts` | chat_messages |
| `subscriptions.ts` | plans, subscriptions, usage |

### Service Abstractions (`packages/shared/src/services/`)

| Service | Path | Implementations |
|---------|------|-----------------|
| AI | `ai/service.ts` | OpenAI (in api) |
| Email | `email/service.ts` | Resend (in api) |
| EventBus | `event-bus/service.ts` | Memory, Redis (in api) |
| FileService | `file/fileservice.ts` | GCS |
| MessageQueue | `message-queue/service.ts` | Redis (in api) |
| PushService | `push/service.ts` | Expo (in api) |

### Test Structure (`packages/api/src/__tests__/`)

```
__tests__/
├── fixtures/          # Mock data: users.ts, plants.ts, care-logs.ts, etc.
├── mocks/             # Mock layers: *.repository.ts, ai.service.ts, etc.
└── services/          # Tests by domain: auth/, plants/, subscriptions/, etc.
```

### Quick Reference Patterns

| To find... | Search pattern |
|------------|----------------|
| Service endpoints | `services/{domain}/endpoints/*.ts` |
| API definitions | `services/{domain}/api.ts` |
| Business logic | `services/{domain}/service.ts` |
| Repository interface | `repositories/{domain}.repository.ts` |
| Domain schemas | `shared/src/domains/{domain}/schema.ts` |
| Domain errors | `shared/src/domains/{domain}/errors.ts` |
| DB table schema | `db/src/schema/{table}.ts` |
| Tests for feature | `__tests__/services/{domain}/*.test.ts` |
| Mock for testing | `__tests__/mocks/{domain}.*.ts` |

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

### Service File Structure

Each service domain in `packages/api/src/services/` follows this structure:

```
services/{domain}/
├── api.ts              # HttpApiEndpoint definitions
├── handlers.ts         # HttpApiBuilder.group implementation
├── service.ts          # Effect.Service aggregator
├── middleware.ts       # Auth/permission middleware (if needed)
└── endpoints/          # Individual endpoint functions
    ├── find-{entity}s.ts
    ├── find-{entity}-by-id.ts
    ├── create-{entity}.ts
    ├── update-{entity}.ts
    └── delete-{entity}.ts
```

### Request/Response Naming

Follow these naming conventions for API DTOs:
- **Requests**: `{Entity}CreateRequest`, `{Entity}UpdateRequest`
- **Responses**: `{Entity}ListResponse`, `{Entity}Response`
- **Params**: `Find{Entity}sParams`, `PaginationParams`
- **Data types**: `Create{Entity}Data`, `Update{Entity}Data` (suffixed with `Data`)

### Middleware Pattern

Use `HttpApiMiddleware.Tag` for cross-cutting concerns:

```typescript
export class Authentication extends HttpApiMiddleware.Tag<Authentication>()(
  'Authentication',
  {
    failure: Unauthorized,
    provides: CurrentUser,
    security: { bearer: HttpApiSecurity.bearer },
  }
) {}
```

### Pagination Pattern

- Use `PaginationParams` schema with `page` and `limit` as strings (for URL encoding)
- Use `parsePaginationParams()` to convert to numbers
- Use `paginate()` helper for building responses
- Return `PaginatedResponse<T>` with `hasMore` field

### Event Publishing

Events are discriminated unions with `_tag` field:

```typescript
eventBus.publish({
  _tag: 'PlantCreated',
  userId,
  plantId: plant.id,
})
```

Use `publishWithRetry()` for resilient event publishing.

### Logging

Use Effect's built-in logger:

```typescript
yield* Effect.log('message', { context: value })
yield* Effect.logWarning('warning message')
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
