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

### Effect.js Patterns

This codebase uses Effect.js for functional programming. Follow these patterns:

**Generator syntax for Effects:**
```typescript
Effect.gen(function* () {
  const repo = yield* PlantRepository
  const data = yield* repo.findById(id)
  return data
})
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

- Test files are colocated with source: `*.test.ts`
- Use `MockDrizzleLive` for isolated database testing
- Provide test layers with mocked dependencies

```typescript
const TestLayer = UserRepositoryLive.pipe(
  Layer.provide(MockDrizzleLive)
)

const result = await Effect.runPromise(
  myEffect.pipe(Effect.provide(TestLayer))
)
```

## Database

- ORM: Drizzle ORM
- Schema location: `packages/db/src/schema.ts`
- Migrations: `packages/db/drizzle/`
- Use UUIDs for primary keys
- Always include `createdAt` and `updatedAt` timestamps

## Important Notes

1. **Always use Effect patterns** - Don't mix Promise-based code with Effect code
2. **Type safety** - Leverage Effect Schema for runtime validation
3. **Layer composition** - Properly provide all dependencies via Layers
4. **Error propagation** - Use typed errors that flow through the Effect system
5. **No semicolons** - Biome enforces this automatically
6. **Single quotes** - Use single quotes for strings
