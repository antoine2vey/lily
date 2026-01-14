# API Services

> Business logic layer organized by domain with Effect.js dependency injection

## Overview

Services are the core business logic layer of the API, organized into 17 domain-specific modules. Each service follows a consistent three-file pattern for endpoint definitions, handler wiring, and implementation logic.

## Service Architecture

```
Service Domain Pattern:
api.ts → Define HTTP endpoints with schemas
   ↓
handlers.ts → Wire endpoints to implementations + provide dependencies
   ↓
endpoints/*.ts → Individual endpoint business logic
   ↓
Repositories → Data access
   ↓
Database
```

## Standard Service Structure

Every service domain follows this pattern:

```
service-name/
├── api.ts                  # HttpApiEndpoint definitions
├── handlers.ts             # HttpApiBuilder + Layer composition
├── endpoints/              # Individual endpoint implementations
│   ├── endpoint-one.ts
│   ├── endpoint-two.ts
│   └── ...
└── service.ts              # (Optional) Service class for shared logic
```

### File Responsibilities

#### `api.ts` - Endpoint Definitions
- Defines HttpApiGroup for the service domain
- Declares all HTTP endpoints with:
  - Method and path
  - Request/response schemas
  - Error types with HTTP status codes
  - Middleware (Authentication, etc.)

#### `handlers.ts` - Handler Wiring
- Implements HttpApiBuilder to wire endpoints
- Provides Effect Layer dependencies
- Composes all required Layers (repositories, services, middleware)

#### `endpoints/*.ts` - Business Logic
- One file per endpoint
- Pure Effect.gen() functions
- Yields dependencies (repositories, services, CurrentUser)
- Returns Effect with typed errors

#### `service.ts` - Shared Logic (Optional)
- Service class for reusable business logic
- Used when multiple endpoints share complex logic
- Implements Effect.Service pattern

## 17 Service Domains

### Core Features
1. **plants** (12 endpoints): Plant CRUD, photos, watering, fertilizing, AI identification, card scanning
2. **care-logs** (5 endpoints): Care history tracking with filtering
3. **ai-chat** (2 endpoints): Plant-specific AI conversations
4. **auth** (5 endpoints): Magic link authentication, JWT tokens, sessions
5. **notifications** (2 endpoints): Push notification management
6. **achievements** (1 endpoint): Badge/milestone retrieval

### User Management
7. **user** (2 endpoints): Profile and settings management
8. **username** (1 endpoint): Username availability checking
9. **admin** (4 endpoints): User management with role-based access

### Infrastructure
10. **device-tokens** (2 endpoints): Device registration for push
11. **subscriptions** (2 endpoints): Tier management, cancellation
12. **email** (provider): Email sending via Resend
13. **push** (provider): Expo push notification delivery
14. **event-bus** (provider): Redis pub-sub event system
15. **message-queue** (provider): Redis queue for background jobs
16. **notification-scheduler** (background): Scheduled notification delivery

## Example Walkthrough: Plants Service

### Structure
```
plants/
├── api.ts                          # 12 endpoints defined
├── handlers.ts                     # Handler wiring + dependencies
├── endpoints/
│   ├── find-plants.ts             # GET /plants
│   ├── find-plant-by-id.ts        # GET /plants/:id
│   ├── create-plant.ts            # POST /plants
│   ├── update-plant.ts            # PATCH /plants/:id
│   ├── delete-plant.ts            # DELETE /plants/:id
│   ├── water-plant.ts             # POST /plants/:id/water
│   ├── fertilize-plant.ts         # POST /plants/:id/fertilize
│   ├── upload-plant-photo.ts      # POST /plants/:id/photos
│   ├── get-plant-photos.ts        # GET /plants/:id/photos
│   ├── delete-plant-photo.ts      # DELETE /plants/:id/photos/:photoId
│   ├── ai-identify.ts             # POST /plants/ai-identify
│   └── scan-card.ts               # POST /plants/scan-card
└── service.ts                      # Shared plant business logic
```

### `api.ts` - Endpoint Definitions

```typescript
import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '../auth/middleware'

export const PlantsApi = HttpApiGroup.make('plants')
  .add(
    HttpApiEndpoint.get('findPlants', '/plants')
      .setUrlParams(PaginationParams)
      .addSuccess(PlantsListResponse)
      .addError(DatabaseError, { status: 500 })
      .middleware(Authentication)
  )
  .add(
    HttpApiEndpoint.post('createPlant', '/plants')
      .setPayload(PlantCreateRequest)
      .addSuccess(Plant, { status: 201 })
      .addError(DatabaseError, { status: 500 })
      .addError(LimitExceededError, { status: 403 })
      .middleware(Authentication)
  )
  // ... 10 more endpoints
  .annotate(HttpApiGroup.ApiTitle, 'Plants API')
```

### `handlers.ts` - Handler Wiring

```typescript
import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '../../api'
import { PlantsService } from './service'
import { PlantRepositoryLive } from '../../repositories/plant.repository'
import { LimitCheckerLive } from '../subscriptions/limit-checker'

export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    Effect.gen(function* () {
      const service = yield* PlantsService
      return handlers
        .handle('findPlants', ({ urlParams }) =>
          service.findPlants(urlParams)
        )
        .handle('createPlant', ({ payload }) =>
          service.createPlant(payload)
        )
        // ... handle all other endpoints
    })
  ).pipe(
    Layer.provide(PlantsService.Default),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(LimitCheckerLive),
    Layer.provide(EventBusLive),
    // ... all required dependencies
  )
```

### `endpoints/create-plant.ts` - Business Logic

```typescript
import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '../../repositories/plant.repository'
import { CurrentUser } from '../auth/middleware'
import { LimitChecker } from '../subscriptions/limit-checker'
import { Effect } from 'effect'

export const createPlant = (
  request: PlantCreateRequest
): Effect.Effect<
  Plant,
  SqlError | DatabaseError | LimitExceededError,
  PlantRepository | CurrentUser | LimitChecker
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const { id: userId } = yield* CurrentUser
    const limitChecker = yield* LimitChecker

    // Check tier limits
    yield* limitChecker.checkPlantLimit(userId)

    // Create plant
    const plant = yield* repo.create({
      name: request.name,
      userId,
      // ... other fields
    })

    // Publish event
    yield* publishWithRetry(eventBus, {
      _tag: 'PlantCreated',
      plantId: plant.id,
      userId,
    })

    return plant
  })
```

## Authentication Integration

### General Authentication

Most endpoints use `Authentication` middleware:

```typescript
HttpApiEndpoint.get('myEndpoint', '/path')
  .middleware(Authentication)
```

This provides `CurrentUser` context tag in endpoints:

```typescript
Effect.gen(function* () {
  const { id: userId, email } = yield* CurrentUser
  // Use userId for authorization
})
```

### Admin Authentication

Admin-only endpoints use `AdminAuth`:

```typescript
// In admin/api.ts
HttpApiEndpoint.post('updateRole', '/admin/users/:id/role')
  .middleware(AdminAuth)
```

Provides `AdminUser` context tag:

```typescript
Effect.gen(function* () {
  const { id: adminId, role } = yield* AdminUser
  // Verify role === 'admin' (already done by middleware)
})
```

## Event Publishing

Services publish domain events for background processing:

```typescript
import { EventBus, publishWithRetry } from '../../events'

Effect.gen(function* () {
  const eventBus = yield* EventBus

  // Publish event with retry
  yield* publishWithRetry(eventBus, {
    _tag: 'PlantCreated',
    plantId: plant.id,
    userId,
  })
})
```

Event types are defined in `src/events/index.ts`.

## Dependency Injection

### Yielding Dependencies

```typescript
Effect.gen(function* () {
  // Repositories
  const repo = yield* PlantRepository

  // Current user from auth
  const { id: userId } = yield* CurrentUser

  // Services
  const ai = yield* AiService
  const eventBus = yield* EventBus

  // Infrastructure
  const db = yield* DrizzleClient
})
```

### Providing Dependencies in Handlers

All dependencies must be provided in `handlers.ts`:

```typescript
).pipe(
  Layer.provide(MyServiceLive),           // Service class
  Layer.provide(MyRepositoryLive),        // Repository
  Layer.provide(ExternalServiceLive),     // External service
  Layer.provide(EventBusLive),            // Event bus
  Layer.provide(AuthenticationLive),      // Auth middleware
)
```

Dependencies flow up through the Layer composition in `src/index.ts`.

## Creating a New Service Domain

### Step 1: Create Directory Structure

```bash
mkdir -p src/services/my-service/endpoints
touch src/services/my-service/api.ts
touch src/services/my-service/handlers.ts
```

### Step 2: Define API (`api.ts`)

```typescript
import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '../auth/middleware'

export const MyServiceApi = HttpApiGroup.make('myService')
  .add(
    HttpApiEndpoint.get('myEndpoint', '/my-service')
      .addSuccess(MyResponse)
      .addError(MyError, { status: 400 })
      .middleware(Authentication)
  )
  .annotate(HttpApiGroup.ApiTitle, 'My Service API')
```

### Step 3: Create Endpoint Implementation

```typescript
// endpoints/my-endpoint.ts
import { Effect } from 'effect'
import { MyRepository } from '../../repositories/my.repository'
import { CurrentUser } from '../auth/middleware'

export const myEndpoint = (): Effect.Effect<
  MyResponse,
  MyError,
  MyRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* MyRepository
    const { id: userId } = yield* CurrentUser

    // Business logic here
    const data = yield* repo.findByUserId(userId)

    return { data }
  })
```

### Step 4: Wire Handlers (`handlers.ts`)

```typescript
import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '../../api'
import { myEndpoint } from './endpoints/my-endpoint'
import { MyRepositoryLive } from '../../repositories/my.repository'

export const MyServiceApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'myService', (handlers) =>
    Effect.gen(function* () {
      return handlers.handle('myEndpoint', () => myEndpoint())
    })
  ).pipe(
    Layer.provide(MyRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
```

### Step 5: Add to Main API (`src/api.ts`)

```typescript
import { MyServiceApi } from './services/my-service/api'

export const Api = HttpApi.make('api')
  .add(PlantsApi)
  .add(AuthApi)
  .add(MyServiceApi)  // Add your new service
  // ...
```

### Step 6: Provide in Server (`src/index.ts`)

```typescript
import { MyServiceApiLive } from './services/my-service/handlers'

const HttpLive = HttpApiBuilder.api(api).pipe(
  Layer.provide(PlantsApiLive(api)),
  Layer.provide(AuthApiLive(api)),
  Layer.provide(MyServiceApiLive(api)),  // Add your handler
  // ...
)
```

### Step 7: Write Tests

Create test file in `__tests__/services/my-service/`:

```typescript
// __tests__/services/my-service/my-endpoint.test.ts
import { createMockMyRepository } from '__tests__/mocks/my.repository'
import { createMockCurrentUser } from '__tests__/mocks/session'
import { myEndpoint } from 'services/my-service/endpoints/my-endpoint'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('myEndpoint', () => {
  it('should return data', async () => {
    const testLayer = Layer.mergeAll(
      createMockMyRepository({ data: mockData }),
      createMockCurrentUser({ id: 'user-1' })
    )

    const result = await Effect.runPromise(
      myEndpoint().pipe(Effect.provide(testLayer))
    )

    expect(result.data).toBeDefined()
  })
})
```

## Background Services

### Event Subscribers

Services can subscribe to events for background processing:

```typescript
// services/achievements/subscriber.ts
import { EventBus } from '../event-bus'
import { Match } from 'effect'

export const startAchievementSubscriber = Effect.gen(function* () {
  const eventBus = yield* EventBus
  const checker = yield* AchievementChecker

  yield* Effect.forever(
    Effect.gen(function* () {
      const event = yield* eventBus.dequeue()

      yield* Match.value(event).pipe(
        Match.when({ _tag: 'PlantCreated' }, (e) =>
          checker.checkPlantAchievements(e.userId)
        ),
        Match.when({ _tag: 'CareLogCreated' }, (e) =>
          checker.checkCareAchievements(e.userId)
        ),
        Match.exhaustive
      )
    })
  )
})
```

### Scheduled Jobs

Services can run scheduled tasks:

```typescript
// services/notification-scheduler/scheduler.ts
export const startNotificationScheduler = Effect.gen(function* () {
  const repo = yield* NotificationRepository
  const queue = yield* MessageQueue

  yield* Effect.forever(
    Effect.gen(function* () {
      // Poll database for pending notifications
      const pending = yield* repo.findPending()

      // Enqueue for processing
      yield* Effect.forEach(pending, (notification) =>
        queue.enqueue('notifications', notification)
      )

      // Wait 1 minute
      yield* Effect.sleep('1 minute')
    })
  )
})
```

## Common Patterns

### Pagination

```typescript
import { PaginationParams } from '@lily/shared'
import { Option, pipe } from 'effect'

export const findAll = (params: PaginationParams) =>
  Effect.gen(function* () {
    const repo = yield* MyRepository
    const page = pipe(Option.fromNullable(params.page), Option.getOrElse(() => 1))
    const limit = pipe(Option.fromNullable(params.limit), Option.getOrElse(() => 20))
    const { items, total } = yield* repo.findAll({ page, limit })

    return {
      items,
      total,
      page,
      limit,
    }
  })
```

### Error Handling

```typescript
import { NotFoundError } from '@lily/shared'

export const findById = (id: string) =>
  Effect.gen(function* () {
    const repo = yield* MyRepository
    const item = yield* repo.findById(id)

    if (!item) {
      return yield* Effect.fail(new NotFoundError({ id }))
    }

    return item
  })
```

### File Uploads

```typescript
import { FileService, GCSService } from '@lily/shared'

export const uploadPhoto = (file: PersistedFile) =>
  Effect.gen(function* () {
    const fileService = yield* FileService
    const gcs = yield* GCSService

    const uploaded = yield* fileService.getFirstUploadedFile(files)
    const url = yield* gcs.uploadFile(uploaded, 'plants')

    return { url }
  })
```

## Related Documentation

- [API Package README](../../README.md) - API architecture overview
- [CLAUDE.md](../../../../CLAUDE.md) - Effect.js patterns & code conventions
- [Testing Guide](../__tests__/README.md) - Testing patterns
- [Repository Guide](../repositories/README.md) - Repository pattern
- [Shared Package](../../../shared/README.md) - Schemas and types

## Quick Reference

### Service File Structure
```
service-name/
├── api.ts           # HttpApiEndpoint definitions
├── handlers.ts      # HttpApiBuilder + Layer composition
├── endpoints/       # Business logic implementations
└── service.ts       # (Optional) Shared logic
```

### Effect.gen Pattern
```typescript
Effect.gen(function* () {
  const dependency = yield* Dependency
  const result = yield* dependency.method()
  return result
})
```

### Common Dependencies
- `PlantRepository`, `UserRepository`, etc. - Data access
- `CurrentUser`, `AdminUser` - Authenticated user
- `AiService`, `EventBus`, `FileService` - External services
- `LimitChecker`, `UsageTracker` - Subscription system
- `DrizzleClient` - Database client

### HttpApiEndpoint Methods
- `.get()`, `.post()`, `.patch()`, `.delete()` - HTTP methods
- `.setPayload()` - Request body schema
- `.setUrlParams()` - URL query parameters
- `.setPath()` - Path parameters
- `.addSuccess()` - Success response schema
- `.addError()` - Error type with HTTP status
- `.middleware()` - Apply middleware
