import {
  createMockAuth,
  createMockHttpServerRequest,
} from '@lily/api/__tests__/mocks/auth'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { mockSession } from '@lily/api/__tests__/fixtures/auth'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { setUsername } from '@lily/api/services/auth/endpoints/set-username'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('setUsername', () => {
  it('should update username when session exists', async () => {
    const TestLayer = Layer.mergeAll(
      createMockAuth(mockSession),
      createMockHttpServerRequest(),
      createMockUserRepository(mockUsers)
    )

    const result = await Effect.runPromise(
      setUsername({ username: 'newusername' }).pipe(Effect.provide(TestLayer))
    )

    expect(result.name).toBe('newusername')
  })

  it('should fail with SessionNotFoundError when no session', async () => {
    const TestLayer = Layer.mergeAll(
      createMockAuth(null),
      createMockHttpServerRequest(),
      createMockUserRepository(mockUsers)
    )

    const result = await Effect.runPromiseExit(
      setUsername({ username: 'newusername' }).pipe(Effect.provide(TestLayer))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with UserNotFoundError when user not in repo', async () => {
    const TestLayer = Layer.mergeAll(
      createMockAuth(mockSession),
      createMockHttpServerRequest(),
      createMockUserRepository([]) // Empty repository
    )

    const result = await Effect.runPromiseExit(
      setUsername({ username: 'newusername' }).pipe(Effect.provide(TestLayer))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return updated user profile', async () => {
    const TestLayer = Layer.mergeAll(
      createMockAuth(mockSession),
      createMockHttpServerRequest(),
      createMockUserRepository(mockUsers)
    )

    const result = await Effect.runPromise(
      setUsername({ username: 'updatedname' }).pipe(Effect.provide(TestLayer))
    )

    expect(result.id).toBe('user-1')
    expect(result.name).toBe('updatedname')
  })
})
