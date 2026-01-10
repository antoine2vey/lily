# Shared Package

> Shared types, schemas, validation, and service interfaces used across API and App

## Overview

The shared package provides a centralized location for domain schemas, validation logic, error definitions, and service abstractions. It enables type-safe communication between the backend API and frontend App while maintaining a clean separation of concerns.

## Architecture

```
Domain-Driven Design:
domains/ → Entity Schemas + Validation + Errors
services/ → Cross-Cutting Service Abstractions
           ↓
    Used by API & App packages
```

## Project Structure

```
src/
├── index.ts                    # Main export aggregation
├── domains/                    # Domain-specific schemas & errors (13 domains)
│   ├── achievement/           # Badge/milestone schemas
│   ├── admin/                 # Admin operations
│   ├── ai-chat/               # AI conversation schemas
│   ├── auth/                  # Authentication schemas
│   ├── care-log/              # Plant care logging
│   ├── common/                # Shared utilities (pagination, errors)
│   ├── device-token/          # Push notification tokens
│   ├── notification/          # User notifications
│   ├── plant/                 # Plant entity & operations
│   ├── subscriptions/         # Billing & usage tracking
│   ├── user/                  # User profiles & settings
│   └── username/              # Username validation
└── services/                   # Service abstractions (6 services)
    ├── ai/                    # AI service interface
    ├── email/                 # Email service interface
    ├── event-bus/             # Event pub-sub abstraction
    ├── file/                  # File storage interface
    ├── message-queue/         # Message queue interface
    └── push/                  # Push notification interface
```

## Domain Organization

### Standard Domain Structure

Each domain follows a consistent pattern:

```
domain/
├── schema.ts       # Zod/Effect schemas for entities & requests/responses
├── errors.ts       # Domain-specific typed errors
├── index.ts        # Re-exports for easy importing
└── selectors.ts    # (Optional) Data projection utilities
```

### 13 Business Domains

#### Core Entities
- **plant**: Plant CRUD, photos, AI identification, care ratings
- **care-log**: Plant care history with filtering
- **user**: User profiles, settings, notification preferences
- **auth**: Authentication requests/responses

#### Features
- **ai-chat**: Plant-specific AI conversations
- **achievement**: Badge system with definitions
- **notification**: Push notification management
- **device-token**: Device registration for push
- **subscriptions**: Tier configuration, usage tracking, billing

#### Admin & Utilities
- **admin**: User management, role/status changes
- **username**: Username availability validation
- **common**: Pagination, database errors, generic schemas

### Domain Examples

#### Simple Domain (username)
```
username/
├── schema.ts       # UsernameCheckRequest, UsernameCheckResponse
└── index.ts        # Exports
```

#### Complex Domain (plant)
```
plant/
├── schema.ts       # Plant, PlantCreateRequest, PlantPhoto, AiIdentifyRequest, etc.
├── errors.ts       # PlantNotFoundError
├── selectors.ts    # selectPlantSummary, selectPlantDetail
└── index.ts        # Exports
```

#### Multi-Entity Domain (subscriptions)
```
subscriptions/
├── schema.ts       # TierConfig, Subscription, SubscriptionUsage, SubscriptionEvent
├── errors.ts       # LimitExceededError, SubscriptionNotFoundError, PaymentProviderError
└── index.ts        # Exports
```

## Schema Patterns

### Zod + Effect Schema

The project uses both Zod and Effect Schema for validation:

**Zod** (most common):
```typescript
import { Schema } from 'zod'

export const Plant = Schema.object({
  id: Schema.string(),
  name: Schema.string(),
  species: Schema.string().optional(),
  health: Schema.enum(['healthy', 'needs_attention', 'critical']),
})

export type Plant = Schema.infer<typeof Plant>
```

**Effect Schema** (for advanced features):
```typescript
import { Schema } from 'effect'

export class Plant extends Schema.Class<Plant>('Plant')({
  id: Schema.String,
  name: Schema.String,
  species: Schema.optional(Schema.String),
  health: Schema.Literal('healthy', 'needs_attention', 'critical'),
}) {}
```

### Request/Response Schemas

```typescript
// Request
export const PlantCreateRequest = Schema.object({
  name: Schema.string(),
  species: Schema.string().optional(),
  wateringFrequencyDays: Schema.number().min(1).optional(),
})

// Response
export const PlantCreateResponse = Plant

// Type inference
export type PlantCreateRequest = Schema.infer<typeof PlantCreateRequest>
```

### Error Definitions

Errors use Effect Schema's `TaggedError` for type-safe error handling:

```typescript
import { Schema } from 'effect'

export class PlantNotFoundError extends Schema.TaggedError<PlantNotFoundError>()(
  'PlantNotFoundError',
  {
    id: Schema.String,
  }
) {}
```

Usage in API:
```typescript
Effect.fail(new PlantNotFoundError({ id: plantId }))
```

## Service Abstractions

### Purpose

Services define provider-agnostic interfaces for cross-cutting concerns. Implementations live in the API package.

### 6 Service Abstractions

#### AI Service (`services/ai/`)
- Plant recognition from images
- AI chat conversations
- Nursery card scanning
- Implementations: OpenAI (API package)

#### Email Service (`services/email/`)
- Transactional email sending
- Implementations: Resend (API package)

#### Event Bus (`services/event-bus/`)
- Publish-subscribe event system
- Provider-agnostic queue interface
- Implementations: Redis, In-Memory (API package)

#### File Service (`services/file/`)
- File upload and storage
- Implementations: Google Cloud Storage (API package)

#### Message Queue (`services/message-queue/`)
- Background job queue
- Implementations: Redis (API package)

#### Push Service (`services/push/`)
- Push notification delivery
- Implementations: Expo Push (API package)

### Service Pattern

Services use Effect.js Context for dependency injection:

```typescript
import { Context, Effect } from 'effect'

// 1. Define interface
export interface IAiService {
  readonly plantChat: (
    params: PlantChatParams
  ) => Effect.Effect<string, AiError>
}

// 2. Create Context.Tag
export class AiService extends Context.Tag('AiService')<
  AiService,
  IAiService
>() {
  static Default = Layer.effect(/* implementation */)
}
```

Usage in API:
```typescript
Effect.gen(function* () {
  const ai = yield* AiService
  const response = yield* ai.plantChat({ message, plantId })
})
```

### Service vs Domain

| Aspect | Domain | Service |
|--------|--------|---------|
| **Purpose** | Entity schemas & validation | Cross-cutting functionality |
| **Location** | `shared/domains/` | `shared/services/` (interface) + `api/services/` (impl) |
| **Examples** | plant, user, subscription | ai, email, push |
| **Contains** | Schemas, errors, types | Interfaces, implementations |
| **Used By** | API & App | Primarily API |

## Using the Shared Package

### Importing Domains

All domains are re-exported from the package index:

```typescript
// In API or App
import { Plant, PlantCreateRequest, PlantNotFoundError } from '@lily/shared'
import { LimitExceededError, TierConfig } from '@lily/shared'
import { PaginationParams } from '@lily/shared'
```

### Using Service Interfaces

Service interfaces are implemented in the API package:

```typescript
// shared/services/ai/service.ts - Interface
export interface IAiService { /* ... */ }

// api/services/ai/openai.ts - Implementation
export const AiServiceLive = Layer.effect(
  AiService,
  Effect.gen(function* () {
    return {
      plantChat: (params) => /* OpenAI implementation */
    }
  })
)
```

## Common Tasks

### Creating a New Domain

1. **Create domain directory**:
```bash
mkdir -p src/domains/my-domain
```

2. **Create `schema.ts`**:
```typescript
import { Schema } from 'zod'

export const MyEntity = Schema.object({
  id: Schema.string(),
  name: Schema.string(),
  createdAt: Schema.date(),
})

export type MyEntity = Schema.infer<typeof MyEntity>

export const MyEntityCreateRequest = Schema.object({
  name: Schema.string().min(1).max(100),
})

export type MyEntityCreateRequest = Schema.infer<typeof MyEntityCreateRequest>
```

3. **Create `errors.ts`** (if needed):
```typescript
import { Schema } from 'effect'

export class MyEntityNotFoundError extends Schema.TaggedError<MyEntityNotFoundError>()(
  'MyEntityNotFoundError',
  {
    id: Schema.String,
  }
) {}
```

4. **Create `index.ts`**:
```typescript
export * from './schema'
export * from './errors'
```

5. **Export from `src/index.ts`**:
```typescript
export * from './domains/my-domain'
```

6. **Use in API endpoints**:
```typescript
import { MyEntity, MyEntityCreateRequest, MyEntityNotFoundError } from '@lily/shared'
```

### Adding Schemas to Existing Domain

1. **Open `domains/[domain]/schema.ts`**
2. **Add new schema**:
```typescript
export const NewRequest = Schema.object({
  // fields
})

export type NewRequest = Schema.infer<typeof NewRequest>
```
3. **Ensure exported from `index.ts`**
4. **Use in API/App**

### Creating Custom Errors

1. **In `domains/[domain]/errors.ts`**:
```typescript
export class MyCustomError extends Schema.TaggedError<MyCustomError>()(
  'MyCustomError',
  {
    message: Schema.String,
    code: Schema.optional(Schema.String),
  }
) {}
```

2. **Use in API**:
```typescript
import { MyCustomError } from '@lily/shared'

if (condition) {
  return Effect.fail(new MyCustomError({
    message: 'Something went wrong',
    code: 'ERR_CODE',
  }))
}
```

3. **Add to endpoint errors**:
```typescript
HttpApiEndpoint.post('myEndpoint', '/path')
  .addError(MyCustomError, { status: 400 })
```

### Implementing a Service Interface

1. **Service interface exists in `shared/services/[service]/`**
2. **Create implementation in `api/services/[service]/`**:
```typescript
import { MyService } from '@lily/shared/services/my-service'

export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    // Get dependencies
    const config = yield* Config

    return {
      myMethod: (params) =>
        Effect.gen(function* () {
          // Implementation
        })
    }
  })
)
```
3. **Provide in handler Layer composition**

## Validation Patterns

### Zod Refinements

```typescript
export const PlantCreateRequest = Schema.object({
  name: Schema.string().min(1).max(100),
  wateringFrequencyDays: Schema.number().min(1).max(365),
}).refine(
  (data) => data.name.trim().length > 0,
  { message: 'Name cannot be empty or whitespace' }
)
```

### Optional vs Nullable

```typescript
// Optional - field may not exist
species: Schema.string().optional()  // { species?: string }

// Nullable - field exists but may be null
species: Schema.string().nullable()  // { species: string | null }

// Both
species: Schema.string().optional().nullable()  // { species?: string | null }
```

### Enums

```typescript
// String literal union
export const PlantHealth = Schema.enum(['healthy', 'needs_attention', 'critical'])
export type PlantHealth = Schema.infer<typeof PlantHealth>

// Native enum (less common)
export enum PlantHealth {
  Healthy = 'healthy',
  NeedsAttention = 'needs_attention',
  Critical = 'critical',
}
```

## Related Documentation

- [Root README](../../README.md) - Project overview
- [CLAUDE.md](../../CLAUDE.md) - Schema patterns and conventions
- [API Package](../api/README.md) - How API uses these schemas
- [Domain Guide](./src/domains/README.md) - Detailed domain patterns
- [Service Guide](./src/services/README.md) - Service abstraction patterns
- [Zod Documentation](https://zod.dev) - Zod schema validation
- [Effect Schema](https://effect.website/docs/schema) - Effect Schema documentation

## Quick Reference

### Commands
```bash
bun run build          # Compile TypeScript
bun run lint           # Check linting
bun run lint:fix       # Fix linting issues
```

### Import Patterns
```typescript
// Domains
import { Plant, PlantCreateRequest, PlantNotFoundError } from '@lily/shared'
import { User, UserProfile, UserNotFoundError } from '@lily/shared'
import { LimitExceededError, TierConfig } from '@lily/shared'

// Common utilities
import { PaginationParams, DatabaseError } from '@lily/shared'

// Services (in API)
import { AiService } from '@lily/shared'
import { EventBus } from '@lily/shared'
```

### Package Exports
All exports are centralized in `src/index.ts` for easy importing.

### Key Files
- `src/index.ts` - Main export file
- `src/domains/*/schema.ts` - Entity schemas
- `src/domains/*/errors.ts` - Custom errors
- `src/services/*/service.ts` - Service interfaces
