# Shared Package Architecture

This document describes the architecture and patterns specific to the shared package.

> **Global rules** (Effect patterns, code conventions) are in the root `/CLAUDE.md`

## Domain Structure

Each domain follows this structure:

```
src/domains/{domain}/
├── schema.ts      # Effect Schema definitions (types + validation)
├── errors.ts      # Domain-specific typed errors
└── selectors.ts   # Data projection functions (optional)
```

## Schema Definitions

Use Effect Schema for type definitions with runtime validation:

```typescript
// schema.ts
import { Schema } from 'effect'

export class Plant extends Schema.Class<Plant>('Plant')({
  id: Schema.String,
  name: Schema.String,
  health: PlantHealthSchema,
  userId: Schema.String,
  createdAt: Schema.Date,
}) {}

export const PlantCreateRequest = Plant.pipe(
  Schema.omit('id', 'createdAt')
)
```

## Error Definitions

Use Schema.TaggedError for typed errors:

```typescript
// errors.ts
import { Schema } from 'effect'

export class PlantNotFoundError extends Schema.TaggedError<PlantNotFoundError>()(
  'PlantNotFoundError',
  { id: Schema.String }
) {}

export class LimitExceededError extends Schema.TaggedError<LimitExceededError>()(
  'LimitExceededError',
  {
    feature: Schema.String,
    limit: Schema.Number,
    current: Schema.Number,
    message: Schema.String,
  }
) {}
```

## Service Abstractions

Service abstractions define interfaces implemented by the API package:

```
src/services/
├── ai/service.ts           # AI chat service interface
├── email/service.ts        # Email sending interface
├── event-bus/service.ts    # Event publishing interface
├── file/fileservice.ts     # File storage interface
├── message-queue/service.ts # Message queue interface
└── push/service.ts         # Push notification interface
```

## Date Utilities

The `domains/common/date.ts` file provides Effect DateTime utilities:

```typescript
import {
  parseApiDate,           // Parse ISO string → Option<DateTime>
  now,                    // Current time as DateTime.Utc
  nowAsDate,              // Current time as native Date
  nowAsEpochMillis,       // Current time as epoch milliseconds
  nowAsIsoString,         // Current time as ISO string
  daysUntil,              // Days until a DateTime
  daysUntilApiDate,       // Parse + calculate days
  formatDayOfWeek,        // "Monday"
  formatDayOfWeekShort,   // "Mon"
  formatRelativeTime,     // "2h ago", "Yesterday"
  formatTime,             // "2:30 PM"
  formatShortDate,        // "Mon, Jan 15"
  isToday,                // Check if today
  isOverdue,              // Check if in the past
  isFuture,               // Check if in the future
} from '@lily/shared'
```

## Export Pattern

All public exports go through `src/index.ts`:

```typescript
// Re-export all domains
export * from './domains/plant/schema'
export * from './domains/plant/errors'
export * from './domains/user/schema'
// ... etc

// Re-export services
export * from './services/ai/service'
export * from './services/email/service'
// ... etc

// Re-export common utilities
export * from './domains/common/date'
export * from './domains/common/pagination'
```
