# Testing Guide

> Comprehensive testing patterns using Vitest, Effect.js, and repository-level mocks

## Overview

The API uses a fixture and mock-based testing approach that leverages Effect.js Layers for dependency injection. Tests are organized by service domain with reusable test data and mock implementations at the repository level.

## Testing Philosophy

### Mock at Repository Level, Not Database

We mock at the **repository layer** rather than the database layer because:

1. **Leverages Effect DI**: Uses Effect Layer composition, consistent with production code
2. **Faster Tests**: No database setup/teardown between tests
3. **Isolation**: Each test runs independently without side effects
4. **Type Safety**: Mocks enforce repository interfaces
5. **Focused Testing**: Tests business logic, not database queries

## Test Structure

```
__tests__/
├── setup.ts                    # Global Vitest configuration
├── fixtures/                   # Reusable test data (8 fixture files)
│   ├── plants.ts              # mockPlants, createTestPlant()
│   ├── users.ts               # mockUsers, createTestUser()
│   ├── care-logs.ts           # mockCareLogs
│   ├── chat.ts                # mockChatMessages
│   ├── device-tokens.ts       # mockDeviceTokens
│   ├── achievements.ts        # mockAchievements
│   ├── notifications.ts       # mockNotifications
│   └── scans.ts               # mockScans
├── mocks/                      # Mock Layer implementations (22 mocks)
│   ├── plant.repository.ts    # createMockPlantRepository()
│   ├── user.repository.ts     # createMockUserRepository()
│   ├── event-bus.ts           # createMockEventBus()
│   ├── session.ts             # createMockCurrentUser()
│   ├── limit-checker.ts       # MockLimitCheckerLive
│   ├── ai.service.ts          # createMockAiService()
│   └── ...
├── integration/                # End-to-end integration tests
│   ├── setup.ts               # Integration test setup
│   └── subscription-limits.integration.test.ts
└── services/                   # Unit tests by domain
    ├── plants/                # 12 test files
    ├── care-logs/             # 5 test files
    ├── auth/                  # 5 test files
    ├── subscriptions/         # 4 test files
    ├── achievements/          # 2 test files
    ├── ai-chat/               # 2 test files
    ├── notifications/         # 2 test files
    ├── device-tokens/         # 2 test files
    ├── user/                  # 2 test files
    ├── admin/                 # 4 test files
    ├── username/              # 1 test file
    └── notification-scheduler/ # 2 test files
```

## Fixtures Pattern

### Purpose

Fixtures provide reusable test data with factory functions for creating variations.

### Example: Plant Fixtures

```typescript
// fixtures/plants.ts
import type { plants } from '@lily/db'

export const mockPlants: (typeof plants.$inferSelect)[] = [
  {
    id: 'plant-1',
    userId: 'user-1',
    name: 'Monstera',
    species: 'Monstera deliciosa',
    health: 'healthy',
    wateringFrequencyDays: 7,
    lastWateredAt: new Date('2025-01-01'),
    nextWateringAt: new Date('2025-01-08'),
    // ... other fields
  },
  {
    id: 'plant-2',
    userId: 'user-1',
    name: 'Snake Plant',
    species: 'Sansevieria',
    health: 'needs_attention',
    // ...
  },
]

// Factory function for custom plants
export const createTestPlant = (
  overrides: Partial<typeof plants.$inferSelect> = {}
): typeof plants.$inferSelect => ({
  id: `plant-${Math.random()}`,
  userId: 'user-1',
  name: 'Test Plant',
  species: 'Test Species',
  health: 'healthy',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})
```

### Using Fixtures

```typescript
import { mockPlants, createTestPlant } from '__tests__/fixtures/plants'

// Use predefined data
const testLayer = createMockPlantRepository({ plants: mockPlants })

// Create custom data
const customPlant = createTestPlant({ name: 'Custom Name', health: 'critical' })
const testLayer = createMockPlantRepository({ plants: [customPlant] })
```

## Mock Pattern

### Creating Mocks

Mocks are factory functions that return Effect Layers:

```typescript
// mocks/plant.repository.ts
import type { IPlantRepository } from '@lily/api/repositories/plant.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { Effect, Layer } from 'effect'

interface MockPlantRepositoryData {
  plants?: Plant[]
  photos?: PlantPhoto[]
}

export const createMockPlantRepository = (
  data: MockPlantRepositoryData = {}
): Layer.Layer<PlantRepository> => {
  const { plants = [], photos = [] } = data

  const repo: IPlantRepository = {
    findAll: () => Effect.succeed({
      items: plants,
      total: plants.length,
    }),

    findById: (id) => {
      const plant = plants.find((p) => p.id === id)
      return plant
        ? Effect.succeed(plant)
        : Effect.fail(new PlantNotFoundError({ id }))
    },

    create: (data) =>
      Effect.succeed({
        id: `plant-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),

    update: (id, data) => {
      const plant = plants.find((p) => p.id === id)
      if (!plant) {
        return Effect.fail(new PlantNotFoundError({ id }))
      }
      return Effect.succeed({ ...plant, ...data })
    },

    delete: (id) => {
      const plant = plants.find((p) => p.id === id)
      if (!plant) {
        return Effect.fail(new PlantNotFoundError({ id }))
      }
      return Effect.succeed(plant)
    },

    // ... other methods
  }

  return Layer.succeed(PlantRepository, repo)
}
```

### Mock Patterns

#### Repository Mocks
- Return Effect.succeed() for successful operations
- Return Effect.fail() for error cases
- Support filtering, pagination, and other query params

#### Service Mocks
- Mock external services (AI, email, push, GCS)
- Track method calls for verification
- Support configurable responses

#### Infrastructure Mocks
- Event bus with published event tracking
- Current user with configurable profile
- Limit checker with configurable behavior

## Writing Tests

### Basic Test Structure

```typescript
import { createMockPlantRepository } from '__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '__tests__/mocks/session'
import { mockPlants } from '__tests__/fixtures/plants'
import { findPlantById } from '@lily/api/services/plants/endpoints/find-plant-by-id'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('findPlantById', () => {
  it('should return plant when found', async () => {
    // Arrange: Create test layer with mocks
    const testLayer = Layer.mergeAll(
      createMockPlantRepository({ plants: mockPlants }),
      createMockCurrentUser({ id: 'user-1' })
    )

    // Act: Run the endpoint with test layer
    const result = await Effect.runPromise(
      findPlantById('plant-1').pipe(Effect.provide(testLayer))
    )

    // Assert: Verify result
    expect(result.id).toBe('plant-1')
    expect(result.name).toBe('Monstera')
  })
})
```

### Testing Success Cases

```typescript
it('should create a new plant', async () => {
  const testLayer = Layer.mergeAll(
    createMockPlantRepository({ plants: [] }),
    createMockCurrentUser({ id: 'user-1' }),
    createMockEventBus(),
    MockLimitCheckerLive
  )

  const result = await Effect.runPromise(
    createPlant({
      name: 'New Plant',
      species: 'Test Species',
    }).pipe(Effect.provide(testLayer))
  )

  expect(result.id).toBeDefined()
  expect(result.name).toBe('New Plant')
})
```

### Testing Error Cases

Use `Effect.runPromiseExit` to test failures:

```typescript
it('should fail with PlantNotFoundError when plant not found', async () => {
  const testLayer = Layer.mergeAll(
    createMockPlantRepository({ plants: [] }),
    createMockCurrentUser({ id: 'user-1' })
  )

  const result = await Effect.runPromiseExit(
    findPlantById('non-existent').pipe(Effect.provide(testLayer))
  )

  expect(Exit.isFailure(result)).toBe(true)

  if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
    expect(result.cause.error).toBeInstanceOf(PlantNotFoundError)
    expect(result.cause.error.id).toBe('non-existent')
  }
})
```

### Testing Event Publishing

Track published events with mock event bus:

```typescript
it('should publish PlantCreated event', async () => {
  const publishedEvents: AppEvent[] = []
  const testLayer = Layer.mergeAll(
    createMockPlantRepository({ plants: [] }),
    createMockCurrentUser({ id: 'user-1' }),
    createMockEventBus({ publishedEvents }),
    MockLimitCheckerLive
  )

  await Effect.runPromise(
    createPlant({ name: 'New Plant' }).pipe(Effect.provide(testLayer))
  )

  expect(publishedEvents).toHaveLength(1)
  expect(publishedEvents[0]._tag).toBe('PlantCreated')
  expect(publishedEvents[0].userId).toBe('user-1')
})
```

### Testing with Multiple Mocks

```typescript
it('should water plant and create care log', async () => {
  const testLayer = Layer.mergeAll(
    createMockPlantRepository({ plants: mockPlants }),
    createMockCareLogRepository({ logs: [] }),
    createMockNotificationRepository(),
    createMockCurrentUser({ id: 'user-1' }),
    createMockEventBus()
  )

  const result = await Effect.runPromise(
    waterPlant('plant-1', { notes: 'Watered today' }).pipe(
      Effect.provide(testLayer)
    )
  )

  expect(result.lastWateredAt).toBeDefined()
})
```

## Effect.runPromise vs Effect.runPromiseExit

### Effect.runPromise
For **success-only** tests:
```typescript
const result = await Effect.runPromise(
  myEndpoint().pipe(Effect.provide(testLayer))
)
// Throws if Effect fails
```

### Effect.runPromiseExit
For **error testing**:
```typescript
const result = await Effect.runPromiseExit(
  myEndpoint().pipe(Effect.provide(testLayer))
)

if (Exit.isSuccess(result)) {
  // Handle success: result.value
} else if (Exit.isFailure(result)) {
  // Handle failure: result.cause
}
```

## Common Mock Scenarios

### Mock Current User

```typescript
const testLayer = createMockCurrentUser({
  id: 'user-1',
  email: 'test@example.com',
  role: 'user',
  status: 'active',
})
```

### Mock Event Bus with Tracking

```typescript
const publishedEvents: AppEvent[] = []
const testLayer = createMockEventBus({ publishedEvents })

// After running endpoint
expect(publishedEvents).toHaveLength(1)
expect(publishedEvents[0]._tag).toBe('PlantCreated')
```

### Mock AI Service with Custom Responses

```typescript
const testLayer = createMockAiService({
  plantChatResponse: 'AI response text',
  plantRecognitionResponse: 'Monstera deliciosa',
})
```

### Mock with Empty Data

```typescript
const testLayer = createMockPlantRepository({ plants: [] })
```

### Mock with Custom Factory Data

```typescript
const customPlant = createTestPlant({
  name: 'Special Plant',
  health: 'critical',
})

const testLayer = createMockPlantRepository({ plants: [customPlant] })
```

## Integration Tests

### Purpose

Integration tests verify end-to-end functionality with a real test database.

### Setup

```typescript
// integration/setup.ts
import { Client } from 'pg'

beforeAll(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL_TEST,
  })
  await client.connect()
  // Setup test data
  await client.end()
})

afterAll(async () => {
  // Cleanup
})
```

### Running Integration Tests

```bash
# Setup test database first
bun run db:setup-test

# Run integration tests
bun run test:integration
```

### Integration Test Example

```typescript
describe('Subscription Limits - Integration', () => {
  it('should enforce plant limit for free users', async () => {
    // Uses real database connection
    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const limitChecker = yield* LimitChecker
        // Create 5 plants (free limit)
        // ... create plants in database
        // Try to create 6th plant
        yield* limitChecker.checkPlantLimit(userId)
      }).pipe(
        Effect.provide(LimitCheckerLive),
        Effect.provide(SubscriptionRepositoryLive),
        Effect.provide(AchievementRepositoryLive)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})
```

## Testing Patterns

### Test Naming

```typescript
describe('endpointName', () => {
  it('should [expected behavior] when [condition]', () => {})
})
```

Examples:
- `should return plant when found`
- `should fail with PlantNotFoundError when plant not found`
- `should create care log with notes when provided`

### Arrange-Act-Assert

```typescript
it('should do something', async () => {
  // Arrange: Setup mocks and test data
  const testLayer = Layer.mergeAll(/* mocks */)

  // Act: Execute the code under test
  const result = await Effect.runPromise(/* endpoint */)

  // Assert: Verify expectations
  expect(result).toBeDefined()
})
```

### Testing Edge Cases

- Empty collections
- Null/undefined values
- Missing required fields
- Invalid IDs
- Permission errors
- Rate limits exceeded

## Common Test Patterns

### Pagination Testing

```typescript
it('should respect page and limit parameters', async () => {
  const testLayer = createMockPlantRepository({ plants: mockPlants })

  const result = await Effect.runPromise(
    findPlants({ page: 2, limit: 5 }).pipe(Effect.provide(testLayer))
  )

  expect(result.page).toBe(2)
  expect(result.limit).toBe(5)
})
```

### Filtering Testing

```typescript
it('should filter by health status', async () => {
  const testLayer = createMockPlantRepository({ plants: mockPlants })

  const result = await Effect.runPromise(
    findPlants({ health: 'needs_attention' }).pipe(Effect.provide(testLayer))
  )

  expect(result.items.every(p => p.health === 'needs_attention')).toBe(true)
})
```

### Permission Testing

```typescript
it('should fail when user lacks permission', async () => {
  const testLayer = Layer.mergeAll(
    createMockPlantRepository({ plants: mockPlants }),
    createMockCurrentUser({ id: 'user-2' }) // Different user
  )

  const result = await Effect.runPromiseExit(
    deletePlant('plant-1').pipe(Effect.provide(testLayer)) // plant-1 belongs to user-1
  )

  expect(Exit.isFailure(result)).toBe(true)
})
```

## Running Tests

### Unit Tests

```bash
# Run all tests
bun test

# Watch mode
bun test --watch

# Specific file
bun test src/__tests__/services/plants/create-plant.test.ts

# Coverage
bun test --coverage
```

### Integration Tests

```bash
# Setup test database
bun run db:setup-test

# Run integration tests only
bun run test:integration
```

### Debugging Tests

```typescript
import { Effect, Console } from 'effect'

it('debug test', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      yield* Console.log('Debug point 1')
      const data = yield* repository.method()
      yield* Console.log('Data:', data)
      return data
    }).pipe(Effect.provide(testLayer))
  )
})
```

## Best Practices

1. **Keep Tests Focused**: One assertion per test when possible
2. **Use Descriptive Names**: Test names should explain what they verify
3. **Mock at Repository Level**: Don't mock database, mock repositories
4. **Reuse Fixtures**: Use fixture data for consistency
5. **Test Error Cases**: Every endpoint should have error tests
6. **Verify Events**: Test that events are published correctly
7. **Clean Test Data**: Use factories for custom test cases
8. **Independent Tests**: Tests should not depend on each other
9. **Fast Tests**: Unit tests should run in milliseconds
10. **Readable Tests**: Follow Arrange-Act-Assert pattern

## Related Documentation

- [API Package README](../../README.md) - API architecture
- [CLAUDE.md](../../../../CLAUDE.md) - Testing guidelines
- [Service Guide](../services/README.md) - Service architecture
- [Vitest Documentation](https://vitest.dev) - Test framework docs
- [Effect.js Testing](https://effect.website/docs/testing) - Effect testing patterns

## Quick Reference

### Running Tests
```bash
bun test                  # All unit tests
bun test --watch          # Watch mode
bun run test:integration  # Integration tests
bun test --coverage       # Coverage report
```

### Effect Test Helpers
```typescript
Effect.runPromise()       # For success-only tests
Effect.runPromiseExit()   # For error testing
Exit.isSuccess()          # Check if Effect succeeded
Exit.isFailure()          # Check if Effect failed
```

### Mock Factories
```typescript
createMockPlantRepository({ plants: [] })
createMockCurrentUser({ id: 'user-1' })
createMockEventBus({ publishedEvents: [] })
MockLimitCheckerLive      # Constant mock
```

### Fixture Factories
```typescript
mockPlants                # Predefined plant array
createTestPlant({ name: 'Custom' })  # Factory with overrides
mockUsers                 # Predefined user array
createTestUser({ role: 'admin' })    # Factory with overrides
```
