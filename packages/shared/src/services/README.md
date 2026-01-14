# Service Abstractions

> Provider-agnostic service interfaces for cross-cutting concerns

## Overview

Service abstractions define interfaces for external integrations and cross-cutting concerns (AI, email, file storage, etc.). They enable provider-agnostic design where interface definitions live in `shared/` and concrete implementations live in `api/`.

## Service vs Domain

| Aspect | Service | Domain |
|--------|---------|--------|
| **Purpose** | Cross-cutting functionality | Entity schemas & validation |
| **Location** | `shared/services/` (interface) + `api/services/` (impl) | `shared/domains/` |
| **Examples** | AI, email, push, file storage | plant, user, subscription |
| **Contains** | Interfaces, Context.Tags | Schemas, errors, types |
| **Implementation** | Multiple providers possible | Single schema definition |
| **Used By** | Primarily API | API & App |

## 6 Service Abstractions

### AI Service (`ai/`)
**Purpose**: AI-powered features (chat, plant recognition, card scanning)

**Interface**:
```typescript
export interface IAiService {
  readonly plantChat: (params: PlantChatParams) => Effect.Effect<string, AiError>
  readonly plantRecognition: (imageUrl: string) => Effect.Effect<Stream, AiError>
  readonly scanNurseryCard: (imageUrl: string) => Effect.Effect<ScanCardResponse, AiError>
}
```

**Implementations**:
- OpenAI (API package): Uses GPT-4 Vision and GPT-4 for chat

**Use Cases**:
- AI chat conversations about plants
- Plant species identification from photos
- Nursery card OCR and parsing

---

### Email Service (`email/`)
**Purpose**: Transactional email sending

**Interface**:
```typescript
export interface IEmailService {
  readonly sendMagicLink: (params: {
    to: string
    token: string
    url: string
  }) => Effect.Effect<void, EmailError>

  readonly sendVerificationEmail: (params: {
    to: string
    token: string
    url: string
  }) => Effect.Effect<void, EmailError>
}
```

**Implementations**:
- Resend (API package): Transactional email provider

**Use Cases**:
- Magic link authentication
- Email verification
- Future: notifications, newsletters

---

### Event Bus (`event-bus/`)
**Purpose**: Pub-sub event system for background processing

**Interface**:
```typescript
export interface IEventBus {
  readonly publish: (event: AppEvent) => Effect.Effect<void, EventError>
  readonly dequeue: () => Effect.Effect<AppEvent, EventError>
  readonly subscribe: (handler: (event: AppEvent) => Effect.Effect<void>) => Effect.Effect<void>
}
```

**Implementations**:
- Redis Pub-Sub (API package): Production implementation
- In-Memory (API package): Test/development implementation

**Use Cases**:
- Achievement unlocking
- Notification scheduling
- Audit logging

---

### File Service (`file/`)
**Purpose**: File upload and storage abstraction

**Interface**:
```typescript
export interface IFileService {
  readonly getFirstUploadedFile: (files: PersistedFile[]) => Effect.Effect<
    PersistedFile,
    NoFilesError | MultipleFilesError
  >

  readonly validateImageFile: (file: PersistedFile) => Effect.Effect<void, InvalidFileError>
}

export interface IGCSService {
  readonly uploadFile: (
    file: PersistedFile,
    folder: string
  ) => Effect.Effect<string, GCSUploadError>

  readonly deleteFile: (url: string) => Effect.Effect<void, GCSDeleteError>
}
```

**Implementations**:
- Google Cloud Storage (API package)
- Future: S3, Azure Blob Storage

**Use Cases**:
- Plant photo uploads
- AI image processing
- Profile pictures

---

### Message Queue (`message-queue/`)
**Purpose**: Background job queue for async processing

**Interface**:
```typescript
export interface IMessageQueue {
  readonly enqueue: <T>(topic: string, message: T) => Effect.Effect<void, QueueError>
  readonly dequeue: <T>(topic: string) => Effect.Effect<T | null, QueueError>
  readonly peek: <T>(topic: string) => Effect.Effect<T | null, QueueError>
  readonly size: (topic: string) => Effect.Effect<number, QueueError>
}
```

**Implementations**:
- Redis Queue (API package): Production implementation

**Use Cases**:
- Notification delivery
- Email sending
- Image processing
- Future: webhooks, exports

---

### Push Service (`push/`)
**Purpose**: Push notification delivery

**Interface**:
```typescript
export interface IPushService {
  readonly sendPushNotification: (params: {
    tokens: string[]
    title: string
    body: string
    data?: Record<string, string>
  }) => Effect.Effect<void, PushError>
}
```

**Implementations**:
- Expo Push (API package): Mobile push notifications

**Use Cases**:
- Watering/fertilizing reminders
- Achievement unlocked notifications
- Chat message notifications

## Service Pattern with Effect.js

### Service Definition

Services use Effect.js Context pattern for dependency injection:

```typescript
// shared/services/my-service/service.ts
import { Context, Effect, Layer } from 'effect'

// 1. Define interface
export interface IMyService {
  readonly myMethod: (param: string) => Effect.Effect<string, MyError>
}

// 2. Create Context.Tag
export class MyService extends Context.Tag('MyService')<
  MyService,
  IMyService
>() {
  // Optional: Default implementation
  static Default = Layer.effect(
    MyService,
    Effect.gen(function* () {
      // Get config/dependencies
      const config = yield* Config

      return {
        myMethod: (param) =>
          Effect.gen(function* () {
            // Implementation
            return `Result: ${param}`
          })
      }
    })
  )
}
```

### Service Implementation

Concrete implementations live in the API package:

```typescript
// api/services/my-service/provider.ts
import { MyService } from '@lily/shared'
import { Effect, Layer } from 'effect'

export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    // Initialize external service client
    const client = initializeClient()

    return {
      myMethod: (param) =>
        Effect.gen(function* () {
          // Call external service
          const result = yield* Effect.tryPromise({
            try: () => client.call(param),
            catch: (error) => new MyError({ message: String(error) }),
          })
          return result
        })
    }
  })
)
```

### Service Usage

Services are yielded in endpoint implementations:

```typescript
// api/services/my-endpoint.ts
import { MyService } from '@lily/shared'

export const myEndpoint = (input: string): Effect.Effect<
  string,
  MyError,
  MyService  // Service dependency
> =>
  Effect.gen(function* () {
    const service = yield* MyService
    const result = yield* service.myMethod(input)
    return result
  })
```

### Providing Services

Services are provided in handler Layer composition:

```typescript
// api/services/handlers.ts
import { MyServiceLive } from './provider'

export const MyApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'myApi', (handlers) =>
    // ... handlers
  ).pipe(
    Layer.provide(MyServiceLive)  // Provide service implementation
  )
```

## Provider-Agnostic Design

### Benefits

1. **Testability**: Easy to mock in tests
2. **Flexibility**: Swap providers without changing code
3. **Isolation**: Interface changes don't affect implementations
4. **Portability**: Shared package has no provider dependencies

### Example: EventBus

The EventBus demonstrates perfect provider-agnostic design:

**Interface** (shared/services/event-bus/):
```typescript
export interface IEventBus {
  readonly publish: (event: AppEvent) => Effect.Effect<void, never>
  readonly dequeue: () => Effect.Effect<AppEvent, never>
}

export class EventBus extends Context.Tag('EventBus')<
  EventBus,
  IEventBus
>() {}
```

**Redis Implementation** (api/services/event-bus/redis.ts):
```typescript
export const RedisEventBusLive = Layer.scoped(
  EventBus,
  Effect.gen(function* () {
    const redis = yield* RedisClient

    const publisher = redis.duplicate()
    const subscriber = redis.duplicate()

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        publisher.quit()
        subscriber.quit()
      })
    )

    return {
      publish: (event) =>
        Effect.tryPromise(() =>
          publisher.publish('events', JSON.stringify(event))
        ),

      dequeue: () =>
        Effect.gen(function* () {
          // Poll internal queue
        })
    }
  })
)
```

**In-Memory Implementation** (api/services/event-bus/memory.ts):
```typescript
export const InMemoryEventBusLive = Layer.effect(
  EventBus,
  Effect.gen(function* () {
    const queue: AppEvent[] = []

    return {
      publish: (event) =>
        Effect.sync(() => {
          queue.push(event)
        }),

      dequeue: () =>
        Effect.sync(() =>
          pipe(Option.fromNullable(queue.shift()), Option.getOrNull)
        ),
    }
  })
)
```

## Creating a New Service Abstraction

### Step 1: Define Interface (shared/services/)

```typescript
// shared/services/my-service/service.ts
import { Context, Effect } from 'effect'

// Define error types
export class MyServiceError extends Schema.TaggedError<MyServiceError>()(
  'MyServiceError',
  {
    message: Schema.String,
    code: Schema.optional(Schema.String),
  }
) {}

// Define interface
export interface IMyService {
  readonly performAction: (input: string) => Effect.Effect<
    string,
    MyServiceError
  >

  readonly batchAction: (inputs: string[]) => Effect.Effect<
    string[],
    MyServiceError
  >
}

// Create Context.Tag
export class MyService extends Context.Tag('MyService')<
  MyService,
  IMyService
>() {}
```

### Step 2: Export from shared/services/index.ts

```typescript
export * from './my-service/service'
```

### Step 3: Implement in API Package

```typescript
// api/services/my-service/provider.ts
import { MyService, MyServiceError } from '@lily/shared'
import { Effect, Layer } from 'effect'

export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    // Initialize client/config
    const apiKey = yield* Config.string('MY_SERVICE_API_KEY')
    const client = initializeClient(apiKey)

    return {
      performAction: (input) =>
        Effect.tryPromise({
          try: () => client.performAction(input),
          catch: (error) =>
            new MyServiceError({
              message: String(error),
              code: 'API_ERROR',
            }),
        }),

      batchAction: (inputs) =>
        Effect.forEach(inputs, (input) =>
          Effect.tryPromise({
            try: () => client.performAction(input),
            catch: (error) =>
              new MyServiceError({
                message: String(error),
                code: 'API_ERROR',
              }),
          }),
          { concurrency: 'unbounded' }
        ),
    }
  })
)
```

### Step 4: Provide in Handler

```typescript
import { MyServiceLive } from './my-service/provider'

export const MyApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'myApi', (handlers) =>
    // ... handlers
  ).pipe(
    Layer.provide(MyServiceLive)
  )
```

### Step 5: Use in Endpoint

```typescript
import { MyService } from '@lily/shared'

export const myEndpoint = (input: string): Effect.Effect<
  string,
  MyServiceError,
  MyService
> =>
  Effect.gen(function* () {
    const service = yield* MyService
    const result = yield* service.performAction(input)
    return result
  })
```

## Testing Service Abstractions

Services are mocked in tests:

```typescript
// __tests__/mocks/my-service.ts
export const createMockMyService = (options: {
  performActionResult?: string
} = {}): Layer.Layer<MyService> => {
  const service: IMyService = {
    performAction: (input) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(options.performActionResult),
          Option.getOrElse(() => `Mock result for ${input}`)
        )
      ),

    batchAction: (inputs) =>
      Effect.succeed(Array.map(inputs, (i) => `Mock result for ${i}`)),
  }

  return Layer.succeed(MyService, service)
}
```

Usage in tests:

```typescript
const testLayer = Layer.mergeAll(
  createMockMyService({ performActionResult: 'Test result' }),
  createMockCurrentUser({ id: 'user-1' })
)

const result = await Effect.runPromise(
  myEndpoint('input').pipe(Effect.provide(testLayer))
)

expect(result).toBe('Test result')
```

## Best Practices

1. **Single Responsibility**: One service per external concern
2. **Provider-Agnostic**: Interface in shared, implementation in API
3. **Effect-Based**: All methods return Effect
4. **Typed Errors**: Define service-specific errors
5. **Idempotent**: Methods should be safe to retry
6. **Batch Support**: Provide batch methods when applicable
7. **Configuration**: Use Effect Config for service keys/URLs
8. **Resource Management**: Use scoped Layers for cleanup
9. **Retry Logic**: Add retries for transient failures
10. **Logging**: Log service calls for debugging

## Common Patterns

### API Client Services

```typescript
export interface IMyApiClient {
  readonly get: <T>(path: string) => Effect.Effect<T, ApiError>
  readonly post: <T>(path: string, body: unknown) => Effect.Effect<T, ApiError>
}
```

### Storage Services

```typescript
export interface IStorageService {
  readonly upload: (file: File, path: string) => Effect.Effect<string, StorageError>
  readonly download: (path: string) => Effect.Effect<Buffer, StorageError>
  readonly delete: (path: string) => Effect.Effect<void, StorageError>
}
```

### Queue Services

```typescript
export interface IQueueService {
  readonly enqueue: <T>(topic: string, data: T) => Effect.Effect<void, QueueError>
  readonly dequeue: <T>(topic: string) => Effect.Effect<T | null, QueueError>
  readonly subscribe: <T>(topic: string, handler: (data: T) => Effect.Effect<void>) => Effect.Effect<void, QueueError>
}
```

## Related Documentation

- [Shared Package README](../../README.md) - Package overview
- [CLAUDE.md](../../../../CLAUDE.md) - Service patterns
- [Domains README](../domains/README.md) - Service vs Domain distinction
- [API Services](../../../api/src/services/README.md) - Service implementations
- [Effect.js Context](https://effect.website/docs/context-management) - Dependency injection

## Quick Reference

### Service Pattern
```typescript
// 1. Interface
export interface IService { readonly method: () => Effect.Effect<T, E> }

// 2. Context.Tag
export class Service extends Context.Tag('Service')<Service, IService>() {}

// 3. Implementation (in API)
export const ServiceLive = Layer.effect(Service, Effect.gen(/* impl */))
```

### Service Usage
```typescript
// Yield in endpoint
const service = yield* MyService
const result = yield* service.method()

// Provide in handler
Layer.provide(MyServiceLive)
```

### Common Service Types
- **AI**: OpenAI, Anthropic, Gemini
- **Email**: Resend, SendGrid, SES
- **Storage**: GCS, S3, Azure Blob
- **Queue**: Redis, SQS, RabbitMQ
- **Push**: Expo, FCM, APNs

### Error Handling
```typescript
Effect.tryPromise({
  try: () => client.method(),
  catch: (error) => new ServiceError({ message: String(error) }),
})
```
