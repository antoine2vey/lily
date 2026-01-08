import { mockSession } from '@lily/api/__tests__/fixtures/auth'
import {
  createMockAuth,
  createMockHttpServerRequest,
} from '@lily/api/__tests__/mocks/auth'
import { getCurrentUser } from '@lily/api/services/auth/endpoints/get-current-user'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getCurrentUser', () => {
  it('should return user when session exists', async () => {
    const TestLayer = Layer.merge(
      createMockAuth(mockSession),
      createMockHttpServerRequest()
    )

    const result = await Effect.runPromise(
      getCurrentUser().pipe(Effect.provide(TestLayer))
    )

    expect(result).toEqual(mockSession.user)
  })

  it('should return user profile with correct fields', async () => {
    const TestLayer = Layer.merge(
      createMockAuth(mockSession),
      createMockHttpServerRequest()
    )

    const result = await Effect.runPromise(
      getCurrentUser().pipe(Effect.provide(TestLayer))
    )

    expect(result.id).toBe('user-1')
    expect(result.email).toBe('test@example.com')
    expect(result.name).toBe('Test User')
  })

  it('should fail with SessionNotFoundError when no session', async () => {
    const TestLayer = Layer.merge(
      createMockAuth(null),
      createMockHttpServerRequest()
    )

    const result = await Effect.runPromiseExit(
      getCurrentUser().pipe(Effect.provide(TestLayer))
    )

    expect(result._tag).toBe('Failure')
  })
})
