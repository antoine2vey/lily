# API Package

> Backend API server using Effect Platform RPC with Bun HTTP runtime

## Overview

The API package is the heart of the Lily application, providing a functional, type-safe backend built with Effect.js. It follows a layered architecture with clear separation of concerns: HTTP endpoints → handlers → services → repositories → database.

## Architecture

```
Request Flow:
HTTP Request → Authentication Middleware → Handler → Endpoint Logic → Repository → Database
                                                    ↓
                                              Event Publishing → Background Jobs
```

### Key Layers

1. **API Layer** (`api.ts`, `services/*/api.ts`): HttpApiEndpoint definitions with schema validation
2. **Handler Layer** (`services/*/handlers.ts`): Wires endpoints to implementations, manages dependencies
3. **Endpoint Layer** (`services/*/endpoints/*.ts`): Business logic implementation
4. **Repository Layer** (`repositories/`): Data access abstraction
5. **Database Layer**: Drizzle ORM with PostgreSQL

## Project Structure

```
src/
├── api.ts                      # Main API aggregation point
├── index.ts                    # Server setup & dependency wiring
├── logger.ts                   # Logging utility
├── events/                     # Event bus infrastructure
│   ├── index.ts               # Event types & bus abstraction
│   └── redis.ts               # Redis pub-sub implementation
├── repositories/               # Data access layer (11 repositories)
│   ├── plant.repository.ts
│   ├── user.repository.ts
│   ├── subscription.repository.ts
│   └── ...
└── services/                   # Business logic (17 service domains)
    ├── auth/                  # Authentication & JWT
    ├── admin/                 # Admin operations with RBAC
    ├── plants/                # Plant CRUD (12 endpoints)
    ├── care-logs/             # Care history tracking
    ├── ai-chat/               # AI conversation service
    ├── subscriptions/         # Stripe billing & usage limits
    ├── achievements/          # Gamification system
    ├── notifications/         # Notification management
    ├── device-tokens/         # Device token management
    ├── user/                  # User profile management
    ├── username/              # Username validation
    ├── email/                 # Email service
    ├── push/                  # Expo push notifications
    ├── event-bus/             # Event publishing provider
    ├── message-queue/         # Redis queue provider
    └── notification-scheduler/ # Background job scheduling
```

## Service Domains

### Core Services
- **auth**: Magic link authentication, JWT tokens, session management
- **plants**: Plant CRUD, watering/fertilizing, photo management, AI identification
- **care-logs**: Plant care history with filtering and pagination
- **ai-chat**: Plant-specific AI conversations with usage tracking

### User Management
- **user**: Profile management, settings, notification preferences
- **username**: Username availability checking
- **admin**: User management with role-based access control (admin-only)

### Features
- **achievements**: Badge/milestone system with event-driven unlocking
- **notifications**: Push notification management with scheduling
- **device-tokens**: Device registration for push notifications
- **subscriptions**: Tier management, usage tracking, Stripe billing

### Infrastructure
- **email**: Email sending via Resend
- **push**: Expo push notification delivery
- **event-bus**: Redis pub-sub event system
- **message-queue**: Redis message queue for background jobs
- **notification-scheduler**: Background workers for notification delivery

## Authentication & Authorization

### Authentication (General Users)
Middleware: `AuthenticationLive` in `services/auth/middleware.ts`

- Bearer token validation via better-auth
- Provides `CurrentUser` context tag
- Checks user status (active, suspended, banned)
- Used by most endpoints

```typescript
// Applied to API groups
HttpApiGroup.make('plants')
  .add(
    HttpApiEndpoint.get('findPlants', '/plants')
      .middleware(Authentication)
  )
```

### Admin Authorization
Middleware: `AdminAuthenticationLive` in `services/admin/middleware.ts`

- Extends Authentication logic
- Verifies `user.role === 'admin'`
- Provides `AdminUser` context tag
- Applied to all `/admin/*` endpoints

## Event System

### Architecture
- **Provider-Agnostic**: EventBus interface with Redis and in-memory implementations
- **Redis Pub-Sub**: Production implementation with separate publisher/subscriber connections
- **Retry Policy**: Exponential backoff (100ms, 200ms, 400ms, max 3 retries)

### Event Types
- `PlantCreated`, `PlantDeleted`
- `CareLogCreated`
- `ChatMessageSent`
- `PhotoUploaded`
- `PlantScanned`

### Usage in Endpoints
```typescript
import { EventBus, publishWithRetry } from '@lily/api/events'

yield* publishWithRetry(
  eventBus,
  { _tag: 'PlantCreated', plantId: plant.id, userId }
)
```

### Background Subscribers
1. **Achievement Checker** (`services/achievements/checker.ts`): Listens to events, unlocks achievements
2. **Notification Scheduler** (`services/notification-scheduler/`): Polls DB, enqueues notifications, delivers via push

## Subscription & Limits System

### Components
- **LimitChecker**: Enforces tier-based feature limits
- **UsageTracker**: Tracks monthly usage (AI chats, scans, identifies)
- **Tier Configuration**:
  - **Free**: 5 plants, 10 AI chats/month, 5 card scans/month, 3 plant identifies/month
  - **Paid**: Unlimited everything

### Integration
Integrated into endpoints that need gating:
- Plant creation (limit: 5 for free users)
- AI chat (limit: 10/month for free users)
- Card scanning (limit: 5/month for free users)
- Plant identification (limit: 3/month for free users)

## Common Tasks

### Adding a New Endpoint to Existing Service

1. **Define endpoint in `api.ts`**:
```typescript
HttpApiEndpoint.post('myEndpoint', '/my-path')
  .setPayload(MyRequestSchema)
  .addSuccess(MyResponseSchema)
  .addError(MyCustomError, { status: 400 })
  .middleware(Authentication)
```

2. **Create endpoint implementation** in `endpoints/my-endpoint.ts`:
```typescript
export const myEndpoint = (request: MyRequest): Effect.Effect<
  MyResponse,
  MyCustomError,
  MyRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* MyRepository
    const { id: userId } = yield* CurrentUser
    // Implementation
  })
```

3. **Wire endpoint in `handlers.ts`**:
```typescript
return handlers.handle('myEndpoint', ({ payload }) =>
  myEndpoint(payload)
)
```

### Creating a New Service Domain

1. **Create service directory**: `services/my-service/`
2. **Create `api.ts`**: Define HttpApiGroup and endpoints
3. **Create `handlers.ts`**: Implement handlers and provide Layer dependencies
4. **Create `endpoints/`**: Individual endpoint implementations
5. **Create `service.ts`** (if needed): Service class for business logic
6. **Wire into `src/api.ts`**:
```typescript
import { MyServiceApi } from './services/my-service/api'
export const Api = HttpApi.make('api').add(MyServiceApi)
```
7. **Add Layer to `src/index.ts`**:
```typescript
import { MyServiceApiLive } from './services/my-service/handlers'
Layer.provide(MyServiceApiLive(api))
```

### Running the Server

```bash
# Development mode with hot reload
bun run dev

# Build for production
bun run build

# Type checking
bunx tsc --build
```

### Testing

```bash
# Run all unit tests
bun test

# Run in watch mode
bun test --watch

# Run integration tests
bun run test:integration

# Coverage report
bun test --coverage
```

See [Testing Guide](./__tests__/README.md) for detailed testing patterns.

## Repository Pattern

Repositories provide a consistent interface for data access:

```typescript
// 1. Define interface
interface IMyRepository {
  findById: (id: string) => Effect.Effect<MyEntity, NotFoundError>
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
      findById: (id) => // implementation
    }
  })
)
```

See [Repository Guide](./src/repositories/README.md) for more details.

## Background Jobs

### Achievement Subscriber
- Listens to EventBus queue
- Pattern-matches events with `Match.exhaustive`
- Unlocks achievements based on thresholds
- Runs continuously via `Effect.forever`

### Notification Scheduler
- **Scheduler**: Polls database every 1 minute for pending notifications
- **Worker**: Consumes Redis queue, sends via Expo Push
- **Dead Letter Queue**: Captures failed deliveries for retry/analysis

## Development Workflow

### Local Setup
1. Ensure PostgreSQL and Redis are running (see root README)
2. Run migrations: `cd ../db && bun run db:push`
3. Seed data: `bun run seed:admin` (in db package)
4. Start API: `bun run dev`

### Environment Variables
Required in `.env`:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `OPENAI_API_KEY`: OpenAI API key
- `BETTER_AUTH_SECRET`: better-auth secret
- See root `.env.example` for complete list

## Related Documentation

- [Root README](../../README.md) - Project overview and setup
- [CLAUDE.md](../../CLAUDE.md) - Code patterns and Effect.js conventions
- [Database Package](../db/README.md) - Schema and migrations
- [Shared Package](../shared/README.md) - Types and service interfaces
- [Service Architecture](./src/services/README.md) - Service patterns
- [Testing Guide](./src/__tests__/README.md) - Testing patterns
- [Repository Guide](./src/repositories/README.md) - Repository pattern

## Quick Reference

### Commands
```bash
bun run dev              # Start dev server
bun run build            # Compile TypeScript
bun test                 # Run tests
bun run lint             # Check linting
bun run lint:fix         # Fix linting issues
bunx tsc --build         # Type check
```

### Key Files
- `src/index.ts` - Server entry point & dependency wiring (110 lines)
- `src/api.ts` - API aggregation (12 service groups)
- `src/events/index.ts` - Event types & bus interface
- `src/repositories/` - 11 repository implementations

### Port
- Default: `3000` (configured in `src/index.ts`)
