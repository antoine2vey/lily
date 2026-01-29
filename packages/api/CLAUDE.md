# API Package Architecture

This document describes the architecture and patterns specific to the API package.

> **Global rules** (Effect patterns, code conventions) are in the root `/CLAUDE.md`

## Service File Structure

Each service domain follows this structure:

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

## Repository Pattern

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

## API Endpoint Definition

Endpoints use Effect Platform's HttpApiEndpoint:

```typescript
HttpApiEndpoint.get('findPlants', '/plants')
  .addSuccess(Schema.Array(Plant))
  .addError(DatabaseError, { status: 500 })
```

## Handler Implementation

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

## Service Definition

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

## Layer Composition

```typescript
Layer.provide(MyServiceLive),
Layer.provide(RepositoryLive),
```

## Middleware Pattern

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

## Request/Response Naming

Follow these naming conventions for API DTOs:
- **Requests**: `{Entity}CreateRequest`, `{Entity}UpdateRequest`
- **Responses**: `{Entity}ListResponse`, `{Entity}Response`
- **Params**: `Find{Entity}sParams`, `PaginationParams`
- **Data types**: `Create{Entity}Data`, `Update{Entity}Data` (suffixed with `Data`)

## Pagination Pattern

- Use `PaginationParams` schema with `page` and `limit` as strings (for URL encoding)
- Use `parsePaginationParams()` to convert to numbers
- Use `paginate()` helper for building responses
- Return `PaginatedResponse<T>` with `hasMore` field

## Event Publishing

Events are discriminated unions with `_tag` field:

```typescript
eventBus.publish({
  _tag: 'PlantCreated',
  userId,
  plantId: plant.id,
})
```

Use `publishWithRetry()` for resilient event publishing.

## Logging

Use Effect's built-in logger:

```typescript
yield* Effect.log('message', { context: value })
yield* Effect.logWarning('warning message')
```

## Error Handling

Define typed errors using Schema.TaggedError:

```typescript
export class PlantNotFoundError extends Schema.TaggedError<PlantNotFoundError>()(
  'PlantNotFoundError',
  { id: Schema.String }
) {}
```

---

## Testing

**Tests are mandatory when writing any new feature or endpoint.**

### Test Structure

Tests are centralized in `src/__tests__/`:

```
__tests__/
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

Mock at the **Repository level**, not at the database level:

```typescript
// __tests__/mocks/user.repository.ts
export const createMockUserRepository = (
  users: User[]
): Layer.Layer<UserRepository> => {
  const repo: IUserRepository = {
    findAll: () => Effect.succeed(users),
    findById: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(users, (u) => u.id === id),
          Option.getOrNull
        )
      ),
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

### Adding Tests for New Features

When adding a new domain/service:

1. Create fixtures in `__tests__/fixtures/{domain}.ts`
2. Create mock repository in `__tests__/mocks/{domain}.repository.ts`
3. Create test files in `__tests__/services/{domain}/`
4. Test all CRUD operations and error cases
