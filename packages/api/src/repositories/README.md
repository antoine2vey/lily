# Repositories

> Data access layer using Effect.js and Drizzle ORM for PostgreSQL

## Overview

Repositories provide a consistent interface for database operations, abstracting Drizzle ORM queries behind Effect-based APIs. They follow a three-part pattern: interface definition, Context.Tag, and Live Layer implementation.

## Repository Pattern

```
Repository Pattern Flow:
Interface (IRepository) → Defines contract
       ↓
Context.Tag (Repository) → Dependency injection tag
       ↓
Live Layer (RepositoryLive) → Implementation with Drizzle
       ↓
Provided in Service Handlers → Dependency composition
       ↓
Yielded in Endpoints → Used in business logic
```

## Standard Repository Structure

Every repository follows this pattern:

```typescript
// 1. Define interface
export interface IMyRepository {
  findAll: (params: PaginationParams) => Effect.Effect<
    { items: MyEntity[]; total: number },
    DatabaseError
  >
  findById: (id: string) => Effect.Effect<MyEntity | null, DatabaseError>
  create: (data: InsertData) => Effect.Effect<MyEntity, DatabaseError>
  update: (id: string, data: UpdateData) => Effect.Effect<MyEntity, DatabaseError>
  delete: (id: string) => Effect.Effect<MyEntity, DatabaseError>
}

// 2. Create Context.Tag
export class MyRepository extends Context.Tag('MyRepository')<
  MyRepository,
  IMyRepository
>() {}

// 3. Implement Live Layer
export const MyRepositoryLive = Layer.effect(
  MyRepository,
  Effect.gen(function* () {
    const db = yield* DrizzleClient

    return {
      findAll: (params) =>
        Effect.gen(function* () {
          const items = yield* Effect.promise(() =>
            db.select().from(myTable).limit(params.limit).offset(/* ... */)
          )
          return { items, total: items.length }
        }),

      findById: (id) =>
        Effect.gen(function* () {
          const items = yield* Effect.promise(() =>
            db.select().from(myTable).where(eq(myTable.id, id))
          )
          return pipe(Array.head(items), Option.getOrNull)
        }),

      // ... other methods
    }
  })
)
```

## 11 Repository Implementations

### Core Entities
1. **PlantRepository** (`plant.repository.ts`)
   - Plant CRUD with photo management
   - Filtering by health, needs attention
   - Pagination support
   - Photo operations (upload, list, delete)

2. **UserRepository** (`user.repository.ts`)
   - User lookup by ID/email
   - Filter by role and status
   - Update profile and settings
   - Search functionality

3. **CareLogRepository** (`care-log.repository.ts`)
   - Care history by plant
   - Filtering by type (watering, fertilizing, etc.)
   - Date range queries
   - Streak calculations

### Features
4. **ChatRepository** (`chat.repository.ts`)
   - Save chat messages (user + assistant)
   - Get chat history by plant
   - Pagination support

5. **NotificationRepository** (`notification.repository.ts`)
   - Find pending/scheduled notifications
   - Mark as queued/sent/failed
   - Filter by user and status

6. **DeviceTokenRepository** (`device-token.repository.ts`)
   - Register/unregister device tokens
   - Find active tokens by user
   - Platform filtering (iOS, Android, web)

7. **AchievementRepository** (`achievement.repository.ts`)
   - Unlock achievements for users
   - Get user achievements with metadata
   - Count user's achievements/progress
   - Plant/photo/care log counting

8. **SubscriptionRepository** (`subscription.repository.ts`)
   - Find user subscription
   - Get tier configuration
   - Track monthly usage
   - Subscription event logging
   - Cancel subscriptions

### Infrastructure
9. **ScanRepository** (`scan.repository.ts`)
   - Record card scan events
   - Track usage for achievements

10. **DeadLetterRepository** (`dead-letter.repository.ts`)
    - Record failed background events
    - Retry tracking

## Example Repository: PlantRepository

### Interface Definition

```typescript
import type { SqlError } from '@effect/sql/SqlError'
import type { plants, plantPhotos } from '@lily/db'
import type { PaginationParams } from '@lily/shared'
import { Context, Effect } from 'effect'

export interface IPlantRepository {
  // Read operations
  findAll: (params: {
    userId: string
    pagination: PaginationParams
    needsAttention?: boolean
    sortBy?: 'name' | 'createdAt'
  }) => Effect.Effect<
    { items: Plant[]; total: number },
    SqlError
  >

  findById: (id: string) => Effect.Effect<Plant | null, SqlError>

  // Write operations
  create: (data: typeof plants.$inferInsert) => Effect.Effect<Plant, SqlError>

  update: (
    id: string,
    data: Partial<typeof plants.$inferInsert>
  ) => Effect.Effect<Plant, SqlError>

  delete: (id: string) => Effect.Effect<Plant, SqlError>

  // Watering/fertilizing
  updateWatering: (
    id: string,
    lastWateredAt: Date,
    nextWateringAt: Date | null
  ) => Effect.Effect<Plant, SqlError>

  updateFertilizing: (
    id: string,
    lastFertilizedAt: Date,
    nextFertilizationAt: Date | null
  ) => Effect.Effect<Plant, SqlError>

  // Photo operations
  addPhoto: (data: typeof plantPhotos.$inferInsert) => Effect.Effect<PlantPhoto, SqlError>

  getPhotos: (plantId: string, pagination: PaginationParams) => Effect.Effect<
    { items: PlantPhoto[]; total: number },
    SqlError
  >

  deletePhoto: (photoId: string) => Effect.Effect<void, SqlError>
}
```

### Context.Tag

```typescript
export class PlantRepository extends Context.Tag('PlantRepository')<
  PlantRepository,
  IPlantRepository
>() {}
```

### Live Implementation

```typescript
import { DrizzleClient } from '@lily/db'
import { plants, plantPhotos } from '@lily/db/schema'
import { Effect, Layer } from 'effect'
import { eq, and, lte, desc } from 'drizzle-orm'

export const PlantRepositoryLive = Layer.effect(
  PlantRepository,
  Effect.gen(function* () {
    const db = yield* DrizzleClient

    return {
      findAll: ({ userId, pagination, needsAttention, sortBy }) =>
        Effect.gen(function* () {
          const { page = 1, limit = 20 } = pagination

          let query = db
            .select()
            .from(plants)
            .where(eq(plants.userId, userId))

          if (needsAttention) {
            query = query.where(
              and(
                eq(plants.userId, userId),
                lte(plants.nextWateringAt, new Date())
              )
            )
          }

          if (sortBy === 'name') {
            query = query.orderBy(plants.name)
          } else {
            query = query.orderBy(desc(plants.createdAt))
          }

          const items = yield* Effect.promise(() =>
            query.limit(limit).offset((page - 1) * limit)
          )

          const [{ count }] = yield* Effect.promise(() =>
            db
              .select({ count: sql<number>`count(*)` })
              .from(plants)
              .where(eq(plants.userId, userId))
          )

          return { items, total: count }
        }),

      findById: (id) =>
        Effect.gen(function* () {
          const items = yield* Effect.promise(() =>
            db.select().from(plants).where(eq(plants.id, id))
          )
          return pipe(Array.head(items), Option.getOrNull)
        }),

      create: (data) =>
        Effect.gen(function* () {
          const [plant] = yield* Effect.promise(() =>
            db.insert(plants).values(data).returning()
          )
          return plant
        }),

      // ... other methods
    }
  })
)
```

## Usage in Services

### Providing Repository

In `handlers.ts`:

```typescript
export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    // ... handler implementation
  ).pipe(
    Layer.provide(PlantsService.Default),
    Layer.provide(PlantRepositoryLive),  // Provide repository
    Layer.provide(EventBusLive),
    // ... other dependencies
  )
```

### Yielding Repository

In endpoint implementation:

```typescript
export const findPlantById = (id: string): Effect.Effect<
  Plant,
  PlantNotFoundError | SqlError,
  PlantRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository  // Yield repository
    const { id: userId } = yield* CurrentUser

    const plant = yield* repo.findById(id)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError({ id }))
    }

    // Verify ownership
    if (plant.userId !== userId) {
      return yield* Effect.fail(new Unauthorized())
    }

    return plant
  })
```

## Common Repository Operations

### CRUD Operations

```typescript
// Create
create: (data) =>
  Effect.gen(function* () {
    const [item] = yield* Effect.promise(() =>
      db.insert(table).values(data).returning()
    )
    return item
  })

// Read by ID
findById: (id) =>
  Effect.gen(function* () {
    const items = yield* Effect.promise(() =>
      db.select().from(table).where(eq(table.id, id))
    )
    return pipe(Array.head(items), Option.getOrNull)
  })

// Update
update: (id, data) =>
  Effect.gen(function* () {
    const [item] = yield* Effect.promise(() =>
      db.update(table).set(data).where(eq(table.id, id)).returning()
    )
    return item
  })

// Delete
delete: (id) =>
  Effect.gen(function* () {
    const [item] = yield* Effect.promise(() =>
      db.delete(table).where(eq(table.id, id)).returning()
    )
    return item
  })
```

### Pagination

```typescript
findAll: (params) =>
  Effect.gen(function* () {
    const { page = 1, limit = 20 } = params

    const items = yield* Effect.promise(() =>
      db
        .select()
        .from(table)
        .limit(limit)
        .offset((page - 1) * limit)
    )

    const [{ count }] = yield* Effect.promise(() =>
      db.select({ count: sql<number>`count(*)` }).from(table)
    )

    return { items, total: count }
  })
```

### Filtering

```typescript
findByStatus: (status) =>
  Effect.gen(function* () {
    const items = yield* Effect.promise(() =>
      db.select().from(table).where(eq(table.status, status))
    )
    return items
  })
```

### Complex Queries

```typescript
findPending: () =>
  Effect.gen(function* () {
    const now = new Date()
    const items = yield* Effect.promise(() =>
      db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.status, 'pending'),
            lte(notifications.scheduledFor, now)
          )
        )
        .orderBy(notifications.scheduledFor)
        .limit(100)
    )
    return items
  })
```

### Joins

```typescript
findWithUser: (id) =>
  Effect.gen(function* () {
    const items = yield* Effect.promise(() =>
      db
        .select()
        .from(plants)
        .leftJoin(users, eq(plants.userId, users.id))
        .where(eq(plants.id, id))
    )
    return pipe(Array.head(items), Option.getOrNull)
  })
```

## Error Handling

### Database Errors

Drizzle operations can fail with `SqlError`:

```typescript
import type { SqlError } from '@effect/sql/SqlError'

export const findById = (id: string): Effect.Effect<
  Plant | null,
  SqlError  // Error type from Drizzle
> =>
  Effect.gen(function* () {
    // Drizzle query wrapped in Effect.promise
    const items = yield* Effect.promise(() =>
      db.select().from(plants).where(eq(plants.id, id))
    )
    return pipe(Array.head(items), Option.getOrNull)
  })
```

### Custom Errors

Transform database errors into domain errors:

```typescript
export const findById = (id: string): Effect.Effect<
  Plant,
  PlantNotFoundError | SqlError
> =>
  Effect.gen(function* () {
    const plant = yield* repo.findById(id)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError({ id }))
    }

    return plant
  })
```

## Creating a New Repository

### Step 1: Define Interface

```typescript
// repositories/my.repository.ts
import type { SqlError } from '@effect/sql/SqlError'
import type { myTable } from '@lily/db'
import { Context, Effect } from 'effect'

export interface IMyRepository {
  findAll: () => Effect.Effect<MyEntity[], SqlError>
  findById: (id: string) => Effect.Effect<MyEntity | null, SqlError>
  create: (data: typeof myTable.$inferInsert) => Effect.Effect<MyEntity, SqlError>
  update: (id: string, data: Partial<typeof myTable.$inferInsert>) => Effect.Effect<MyEntity, SqlError>
  delete: (id: string) => Effect.Effect<MyEntity, SqlError>
}

type MyEntity = typeof myTable.$inferSelect
```

### Step 2: Create Context.Tag

```typescript
export class MyRepository extends Context.Tag('MyRepository')<
  MyRepository,
  IMyRepository
>() {}
```

### Step 3: Implement Live Layer

```typescript
import { DrizzleClient } from '@lily/db'
import { myTable } from '@lily/db/schema'
import { Effect, Layer } from 'effect'
import { eq } from 'drizzle-orm'

export const MyRepositoryLive = Layer.effect(
  MyRepository,
  Effect.gen(function* () {
    const db = yield* DrizzleClient

    return {
      findAll: () =>
        Effect.promise(() => db.select().from(myTable)),

      findById: (id) =>
        Effect.gen(function* () {
          const items = yield* Effect.promise(() =>
            db.select().from(myTable).where(eq(myTable.id, id))
          )
          return pipe(Array.head(items), Option.getOrNull)
        }),

      create: (data) =>
        Effect.gen(function* () {
          const items = yield* Effect.promise(() =>
            db.insert(myTable).values(data).returning()
          )
          return pipe(Array.head(items), Option.getOrUndefined)
        }),

      update: (id, data) =>
        Effect.gen(function* () {
          const items = yield* Effect.promise(() =>
            db.update(myTable).set(data).where(eq(myTable.id, id)).returning()
          )
          return pipe(Array.head(items), Option.getOrUndefined)
        }),

      delete: (id) =>
        Effect.gen(function* () {
          const items = yield* Effect.promise(() =>
            db.delete(myTable).where(eq(myTable.id, id)).returning()
          )
          return pipe(Array.head(items), Option.getOrUndefined)
        }),
    }
  })
)
```

### Step 4: Provide in Handler

```typescript
import { MyRepositoryLive } from '../repositories/my.repository'

export const MyServiceApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'myService', (handlers) =>
    // ...
  ).pipe(
    Layer.provide(MyRepositoryLive)  // Provide repository
  )
```

### Step 5: Use in Endpoint

```typescript
import { MyRepository } from '../repositories/my.repository'

export const myEndpoint = (): Effect.Effect<
  MyEntity[],
  SqlError,
  MyRepository
> =>
  Effect.gen(function* () {
    const repo = yield* MyRepository
    const items = yield* repo.findAll()
    return items
  })
```

## Testing Repositories

Repositories are mocked at the interface level in tests:

```typescript
// __tests__/mocks/my.repository.ts
export const createMockMyRepository = (
  data: { items: MyEntity[] } = { items: [] }
): Layer.Layer<MyRepository> => {
  const repo: IMyRepository = {
    findAll: () => Effect.succeed(data.items),
    findById: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(data.items, (i) => i.id === id),
          Option.getOrNull
        )
      ),
    // ... other methods
  }

  return Layer.succeed(MyRepository, repo)
}
```

See [Testing Guide](../__tests__/README.md) for full testing patterns.

## Best Practices

1. **Return Null for Not Found**: Don't fail Effect, return `null` and handle in endpoint
2. **Wrap Drizzle in Effect.promise**: All Drizzle queries must be wrapped
3. **Type Safety**: Use Drizzle's inferred types (`$inferSelect`, `$inferInsert`)
4. **Pagination**: Always support pagination for list operations
5. **Filtering**: Accept filter params as function arguments
6. **Atomic Operations**: Use database transactions for multi-step updates
7. **Error Propagation**: Let SqlError flow up, handle in endpoints
8. **Consistent Naming**: Use `find`, `create`, `update`, `delete` prefixes
9. **Return Full Entities**: Use `.returning()` to get updated records
10. **Document Complex Queries**: Add comments for non-obvious queries

## Drizzle Patterns

### Select with Conditions

```typescript
import { eq, and, or, lte, gte } from 'drizzle-orm'

db.select()
  .from(table)
  .where(
    and(
      eq(table.userId, userId),
      or(
        eq(table.status, 'active'),
        eq(table.status, 'pending')
      )
    )
  )
```

### Insert

```typescript
const [item] = await db.insert(table).values(data).returning()
```

### Update

```typescript
const [item] = await db
  .update(table)
  .set({ name: 'New Name' })
  .where(eq(table.id, id))
  .returning()
```

### Delete

```typescript
const [item] = await db
  .delete(table)
  .where(eq(table.id, id))
  .returning()
```

### Count

```typescript
import { sql } from 'drizzle-orm'

const [{ count }] = await db
  .select({ count: sql<number>`count(*)` })
  .from(table)
```

## Related Documentation

- [API Package README](../../README.md) - API architecture
- [CLAUDE.md](../../../../CLAUDE.md) - Repository pattern conventions
- [Database Package](../../../db/README.md) - Schema definitions
- [Services Guide](../services/README.md) - How services use repositories
- [Testing Guide](../__tests__/README.md) - Testing repositories
- [Drizzle ORM Docs](https://orm.drizzle.team) - Official documentation

## Quick Reference

### Repository Pattern
```typescript
interface IRepository { /* methods */ }
class Repository extends Context.Tag('Repository')<Repository, IRepository>() {}
const RepositoryLive = Layer.effect(Repository, Effect.gen(/* impl */))
```

### Drizzle Operations
```typescript
db.select().from(table)                 // Select all
db.select().from(table).where(condition) // Select with filter
db.insert(table).values(data).returning() // Insert
db.update(table).set(data).where(condition).returning() // Update
db.delete(table).where(condition).returning() // Delete
```

### Effect Wrappers
```typescript
Effect.promise(() => db.select()...)  // Wrap Drizzle query
Effect.gen(function* () { /* ... */ })  // Async composition
```

### Common Imports
```typescript
import { DrizzleClient } from '@lily/db'
import { table } from '@lily/db/schema'
import { Effect, Layer, Context } from 'effect'
import { eq, and, or, lte, gte, desc } from 'drizzle-orm'
import type { SqlError } from '@effect/sql/SqlError'
```
