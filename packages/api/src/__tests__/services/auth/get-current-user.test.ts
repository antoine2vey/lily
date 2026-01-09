import { mockSession } from '@lily/api/__tests__/fixtures/auth'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import {
  createMockAuth,
  createMockHttpServerRequest,
} from '@lily/api/__tests__/mocks/auth'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { getCurrentUser } from '@lily/api/services/auth/endpoints/get-current-user'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getCurrentUser', () => {
  it('should return user when session exists', async () => {
    const TestLayer = Layer.mergeAll(
      createMockAuth(mockSession),
      createMockHttpServerRequest(),
      createMockUserRepository(mockUsers)
    )

    const result = await Effect.runPromise(
      getCurrentUser().pipe(Effect.provide(TestLayer))
    )

    expect(result.id).toBe(mockSession.user.id)
    expect(result.email).toBe(mockSession.user.email)
  })

  it('should return user profile with correct fields', async () => {
    const TestLayer = Layer.mergeAll(
      createMockAuth(mockSession),
      createMockHttpServerRequest(),
      createMockUserRepository(mockUsers)
    )

    const result = await Effect.runPromise(
      getCurrentUser().pipe(Effect.provide(TestLayer))
    )

    expect(result.id).toBe('user-1')
    expect(result.email).toBe('test@example.com')
    expect(result.name).toBe('Test User')
    expect(result.role).toBe('user')
    expect(result.status).toBe('active')
  })

  it('should fail with SessionNotFoundError when no session', async () => {
    const TestLayer = Layer.mergeAll(
      createMockAuth(null),
      createMockHttpServerRequest(),
      createMockUserRepository(mockUsers)
    )

    const result = await Effect.runPromiseExit(
      getCurrentUser().pipe(Effect.provide(TestLayer))
    )

    expect(result._tag).toBe('Failure')
  })
})
