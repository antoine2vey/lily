# Domains

> Domain-driven schemas, validation, and error definitions for business entities

## Overview

Domains represent business entities and their associated operations. Each domain is a self-contained module with schemas for validation, custom errors, and optional data projections. The domain structure promotes consistency, type safety, and clear separation of concerns.

## Domain-Driven Design

```
Domain Structure:
Entity Definition (schema.ts)
       ↓
Validation (Zod/Effect Schema)
       ↓
Custom Errors (errors.ts)
       ↓
Data Projections (selectors.ts - optional)
       ↓
Used in API & App
```

## Standard Domain Structure

Every domain follows this convention:

```
domain-name/
├── schema.ts       # Entity schemas, request/response types, validation
├── errors.ts       # Domain-specific typed errors
├── index.ts        # Re-exports all schemas and errors
└── selectors.ts    # (Optional) Data projection utilities
```

## 13 Business Domains

### Core Entities

#### **plant** - Plant Management
- **Schemas**: Plant, PlantCreateRequest, PlantUpdateRequest, PlantPhoto, AiIdentifyRequest, ScanCardResponse
- **Errors**: PlantNotFoundError
- **Selectors**: selectPlantSummary, selectPlantDetail
- **Operations**: CRUD, watering, fertilizing, photo management, AI identification

#### **user** - User Profiles
- **Schemas**: UserProfile, UserSettings, UserSettingsUpdate, NotificationPreferences
- **Errors**: UserNotFoundError
- **Operations**: Profile management, settings updates, notification preferences

#### **care-log** - Plant Care History
- **Schemas**: CareLog, CareLogCreateRequest, CareLogType
- **Errors**: CareLogNotFoundError
- **Operations**: Create, read, update, delete care logs with filtering

### Features

#### **ai-chat** - AI Conversations
- **Schemas**: ChatRequest, ChatResponse, ChatMessage, ChatHistoryListResponse
- **Operations**: Send messages, get history, plant-specific chats

#### **achievement** - Gamification
- **Schemas**: Achievement, AchievementDefinition, UserAchievement
- **Definitions**: FIRST_PLANT_ADDED, PLANT_COLLECTOR, WATERING_NOVICE, etc.
- **Operations**: Get user achievements, unlock tracking

#### **notification** - Push Notifications
- **Schemas**: Notification, NotificationListResponse, NotificationStatus
- **Errors**: NotificationNotFoundError
- **Operations**: Get notifications, mark as read, filter by status

#### **device-token** - Push Registration
- **Schemas**: DeviceToken, DeviceTokenRegisterRequest, DevicePlatform
- **Operations**: Register/unregister device tokens for push

#### **subscriptions** - Billing & Usage
- **Schemas**: TierConfig, Subscription, SubscriptionUsage, SubscriptionEvent
- **Errors**: LimitExceededError, SubscriptionNotFoundError, PaymentProviderError
- **Operations**: Tier management, usage tracking, subscription lifecycle

### Admin & Auth

#### **admin** - User Management
- **Schemas**: UserListRequest, UserListResponse, UpdateRoleRequest, UpdateStatusRequest
- **Operations**: List users, update roles, change status, delete users

#### **auth** - Authentication
- **Schemas**: SignInRequest, SignInResponse, VerifyEmailRequest, UserSession
- **Operations**: Magic link login, email verification, session management

#### **username** - Username Validation
- **Schemas**: UsernameCheckRequest, UsernameCheckResponse
- **Operations**: Check availability, validate format

### Utilities

#### **common** - Shared Types
- **Schemas**: PaginationParams, PaginatedResponse, DatabaseError
- **Types**: Error responses, pagination utilities

## Domain Examples

### Simple Domain: username

```
username/
├── schema.ts       # 2 schemas (request, response)
└── index.ts        # Exports
```

**schema.ts**:
```typescript
import { Schema } from 'zod'

export const UsernameCheckRequest = Schema.object({
  username: Schema.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
})

export type UsernameCheckRequest = Schema.infer<typeof UsernameCheckRequest>

export const UsernameCheckResponse = Schema.object({
  available: Schema.boolean(),
  username: Schema.string(),
})

export type UsernameCheckResponse = Schema.infer<typeof UsernameCheckResponse>
```

### Complex Domain: plant

```
plant/
├── schema.ts       # 10+ schemas (Plant, requests, AI features)
├── errors.ts       # PlantNotFoundError
├── selectors.ts    # Data projection functions
└── index.ts        # Exports
```

**schema.ts** excerpt:
```typescript
// Entity schema
export const Plant = Schema.object({
  id: Schema.string(),
  userId: Schema.string(),
  name: Schema.string(),
  species: Schema.string().optional(),
  health: Schema.enum(['healthy', 'needs_attention', 'critical']),
  wateringFrequencyDays: Schema.number().min(1).optional(),
  lastWateredAt: Schema.date().optional(),
  nextWateringAt: Schema.date().optional(),
  // ... more fields
})

export type Plant = Schema.infer<typeof Plant>

// Request schemas
export const PlantCreateRequest = Schema.object({
  name: Schema.string().min(1).max(100),
  species: Schema.string().max(100).optional(),
  wateringFrequencyDays: Schema.number().min(1).max(365).optional(),
  // ... more fields
})

export type PlantCreateRequest = Schema.infer<typeof PlantCreateRequest>
```

**errors.ts**:
```typescript
import { Schema } from 'effect'

export class PlantNotFoundError extends Schema.TaggedError<PlantNotFoundError>()(
  'PlantNotFoundError',
  {
    id: Schema.String,
  }
) {}
```

**selectors.ts**:
```typescript
export const selectPlantSummary = (plant: Plant) => ({
  id: plant.id,
  name: plant.name,
  species: plant.species,
  health: plant.health,
  needsWatering: plant.nextWateringAt && plant.nextWateringAt < new Date(),
})
```

### Multi-Entity Domain: subscriptions

```
subscriptions/
├── schema.ts       # TierConfig, Subscription, Usage, Events
├── errors.ts       # 3 error types
└── index.ts        # Exports
```

**schema.ts** excerpt:
```typescript
// Tier configuration (from database)
export const TierConfig = Schema.object({
  tier: Schema.enum(['free', 'paid']),
  name: Schema.string(),
  priceMonthly: Schema.number(),
  maxPlants: Schema.number().nullable(),  // null = unlimited
  maxAiChatsMonthly: Schema.number().nullable(),
  maxCardScansMonthly: Schema.number().nullable(),
  maxPlantIdentifiesMonthly: Schema.number().nullable(),
})

// User subscription
export const Subscription = Schema.object({
  id: Schema.string(),
  userId: Schema.string(),
  tier: Schema.enum(['free', 'paid']),
  status: Schema.enum(['active', 'trialing', 'canceled', 'expired', 'past_due']),
  // ... billing fields
})

// Monthly usage tracking
export const SubscriptionUsage = Schema.object({
  id: Schema.string(),
  userId: Schema.string(),
  periodStart: Schema.date(),
  periodEnd: Schema.date(),
  aiChatsCount: Schema.number(),
  cardScansCount: Schema.number(),
  plantIdentifiesCount: Schema.number(),
})
```

**errors.ts**:
```typescript
export class LimitExceededError extends Schema.TaggedError<LimitExceededError>()(
  'LimitExceededError',
  {
    feature: Schema.String,
    limit: Schema.Number,
    current: Schema.Number,
    message: Schema.String,
  }
) {}

export class SubscriptionNotFoundError extends Schema.TaggedError<SubscriptionNotFoundError>()(
  'SubscriptionNotFoundError',
  {
    userId: Schema.String,
  }
) {}

export class PaymentProviderError extends Schema.TaggedError<PaymentProviderError>()(
  'PaymentProviderError',
  {
    message: Schema.String,
    code: Schema.optional(Schema.String),
  }
) {}
```

## Creating a New Domain

### Step 1: Create Directory

```bash
cd packages/shared/src/domains
mkdir my-domain
cd my-domain
```

### Step 2: Create `schema.ts`

```typescript
import { Schema } from 'zod'

// Entity schema
export const MyEntity = Schema.object({
  id: Schema.string(),
  name: Schema.string(),
  description: Schema.string().optional(),
  status: Schema.enum(['active', 'inactive']),
  createdAt: Schema.date(),
  updatedAt: Schema.date(),
})

export type MyEntity = Schema.infer<typeof MyEntity>

// Request schemas
export const MyEntityCreateRequest = Schema.object({
  name: Schema.string().min(1).max(100),
  description: Schema.string().max(500).optional(),
  status: Schema.enum(['active', 'inactive']).default('active'),
})

export type MyEntityCreateRequest = Schema.infer<typeof MyEntityCreateRequest>

export const MyEntityUpdateRequest = MyEntityCreateRequest.partial()

export type MyEntityUpdateRequest = Schema.infer<typeof MyEntityUpdateRequest>

// Response schemas
export const MyEntityListResponse = Schema.object({
  items: Schema.array(MyEntity),
  total: Schema.number(),
  page: Schema.number(),
  limit: Schema.number(),
})

export type MyEntityListResponse = Schema.infer<typeof MyEntityListResponse>
```

### Step 3: Create `errors.ts` (if needed)

```typescript
import { Schema } from 'effect'

export class MyEntityNotFoundError extends Schema.TaggedError<MyEntityNotFoundError>()(
  'MyEntityNotFoundError',
  {
    id: Schema.String,
  }
) {}

export class MyEntityValidationError extends Schema.TaggedError<MyEntityValidationError>()(
  'MyEntityValidationError',
  {
    field: Schema.String,
    message: Schema.String,
  }
) {}
```

### Step 4: Create `index.ts`

```typescript
export * from './schema'
export * from './errors'
```

### Step 5: Export from `shared/src/index.ts`

```typescript
// Add to the main index.ts
export * from './domains/my-domain'
```

### Step 6: Use in API

```typescript
import {
  MyEntity,
  MyEntityCreateRequest,
  MyEntityNotFoundError,
} from '@lily/shared'

// In endpoint implementation
export const createMyEntity = (request: MyEntityCreateRequest) =>
  Effect.gen(function* () {
    // Use schemas and errors
  })
```

## Schema Patterns

### Zod vs Effect Schema

**Zod** (most common):
```typescript
import { Schema } from 'zod'

export const Plant = Schema.object({
  id: Schema.string(),
  name: Schema.string(),
})
```

**Effect Schema** (for advanced features):
```typescript
import { Schema } from 'effect'

export class Plant extends Schema.Class<Plant>('Plant')({
  id: Schema.String,
  name: Schema.String,
}) {}
```

### Validation Patterns

#### String Validation
```typescript
name: Schema.string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .regex(/^[a-zA-Z0-9 ]+$/, 'Invalid characters')
```

#### Number Validation
```typescript
age: Schema.number()
  .min(1, 'Must be positive')
  .max(365, 'Too large')
  .int('Must be integer')
```

#### Enum Validation
```typescript
status: Schema.enum(['active', 'inactive', 'pending'])
```

#### Optional vs Nullable
```typescript
// Optional - field may not exist
description: Schema.string().optional()  // { description?: string }

// Nullable - field exists but may be null
description: Schema.string().nullable()  // { description: string | null }

// Both
description: Schema.string().optional().nullable()  // { description?: string | null }
```

#### Custom Refinements
```typescript
export const PlantCreateRequest = Schema.object({
  name: Schema.string(),
  wateringFrequencyDays: Schema.number().min(1),
}).refine(
  (data) => data.name.trim().length > 0,
  { message: 'Name cannot be empty', path: ['name'] }
)
```

### Error Definition Pattern

All errors use Effect Schema's `TaggedError`:

```typescript
import { Schema } from 'effect'

export class MyError extends Schema.TaggedError<MyError>()(
  'MyError',  // Error tag for pattern matching
  {
    // Error fields with schemas
    id: Schema.String,
    message: Schema.String,
    code: Schema.optional(Schema.String),
  }
) {}
```

Usage:
```typescript
// Fail with error
if (!found) {
  return yield* Effect.fail(new MyError({
    id: 'entity-1',
    message: 'Not found',
    code: 'NOT_FOUND',
  }))
}

// Pattern match on error
yield* Match.value(error).pipe(
  Match.when({ _tag: 'MyError' }, (e) => handleMyError(e)),
  Match.orElse(() => handleOtherError())
)
```

### Response Types

#### Single Entity
```typescript
export const MyResponse = MyEntity
export type MyResponse = Schema.infer<typeof MyResponse>
```

#### List with Pagination
```typescript
export const MyListResponse = Schema.object({
  items: Schema.array(MyEntity),
  total: Schema.number(),
  page: Schema.number(),
  limit: Schema.number(),
})
```

#### Success/Error Messages
```typescript
export const SuccessResponse = Schema.object({
  message: Schema.string(),
})
```

## Best Practices

1. **Keep Domains Focused**: One domain per business entity or feature
2. **Consistent Naming**: Use singular names (plant, user, notification)
3. **Validation First**: Add validation rules in schemas, not in code
4. **Type Safety**: Always infer types from schemas
5. **Reuse Schemas**: Compose schemas using `.extend()`, `.partial()`, `.pick()`
6. **Document Enums**: Add comments explaining enum values
7. **Optional Selectors**: Only add selectors when needed for data transformation
8. **Custom Errors**: Create typed errors for domain-specific failures
9. **Export Everything**: Export all schemas and types from `index.ts`
10. **Validate Early**: Validate at API boundaries, not in business logic

## Schema Composition

### Extending Schemas

```typescript
const BaseEntity = Schema.object({
  id: Schema.string(),
  createdAt: Schema.date(),
  updatedAt: Schema.date(),
})

export const MyEntity = BaseEntity.extend({
  name: Schema.string(),
  description: Schema.string(),
})
```

### Partial Updates

```typescript
export const MyEntityUpdateRequest = MyEntityCreateRequest.partial()
// Makes all fields optional
```

### Pick/Omit

```typescript
// Pick specific fields
export const MyEntitySummary = MyEntity.pick({
  id: true,
  name: true,
})

// Omit fields
export const MyEntityPublic = MyEntity.omit({
  internalField: true,
})
```

## Related Documentation

- [Shared Package README](../../README.md) - Package overview
- [CLAUDE.md](../../../../CLAUDE.md) - Schema patterns and conventions
- [API Services](../../../api/src/services/README.md) - How services use domains
- [Service Abstractions](../services/README.md) - Service vs Domain distinction
- [Zod Documentation](https://zod.dev) - Zod schema validation
- [Effect Schema](https://effect.website/docs/schema) - Effect Schema docs

## Quick Reference

### Domain Files
```
domain/
├── schema.ts       # Entity + request/response schemas
├── errors.ts       # Custom tagged errors
├── index.ts        # Re-exports
└── selectors.ts    # (Optional) Data projections
```

### Common Imports
```typescript
// Zod
import { Schema } from 'zod'

// Effect Schema
import { Schema } from 'effect'

// Type inference
export type MyType = Schema.infer<typeof MySchema>
```

### Validation Shortcuts
```typescript
.min(n)              // Minimum length/value
.max(n)              // Maximum length/value
.optional()          // Field is optional
.nullable()          // Field can be null
.default(value)      // Default value
.regex(pattern)      // Regex validation
.enum([values])      # Enum validation
.refine(fn, msg)     // Custom validation
```

### Error Pattern
```typescript
export class MyError extends Schema.TaggedError<MyError>()(
  'MyError',
  { /* fields */ }
) {}
```
