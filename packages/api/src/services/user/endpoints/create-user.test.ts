import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import {
  getMockStore,
  MockDrizzleLive,
  resetMockStore,
} from '@lily/api/test-utils/mocks/drizzle'
import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUser } from './create-user'

const TestLayer = UserRepositoryLive.pipe(Layer.provide(MockDrizzleLive))

describe('createUser', () => {
  beforeEach(() => {
    resetMockStore()
  })

  it('should create a new user', async () => {
    const initialCount = getMockStore().length

    const result = await Effect.runPromise(
      createUser('New User', 'new@example.com').pipe(Effect.provide(TestLayer))
    )

    expect(result.name).toBe('New User')
    expect(result.email).toBe('new@example.com')
    expect(result.id).toBeDefined()
    expect(getMockStore().length).toBe(initialCount + 1)
  })

  it('should return the created user with an id', async () => {
    const result = await Effect.runPromise(
      createUser('Test', 'test@test.com').pipe(Effect.provide(TestLayer))
    )

    expect(result.id).toBeTruthy()
    expect(typeof result.id).toBe('string')
  })

  it('should set emailVerified to false by default', async () => {
    const result = await Effect.runPromise(
      createUser('Test', 'test@test.com').pipe(Effect.provide(TestLayer))
    )

    expect(result.emailVerified).toBe(false)
  })
})
