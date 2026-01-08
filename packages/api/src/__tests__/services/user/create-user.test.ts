import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createUser } from '@lily/api/services/user/endpoints/create-user'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('createUser', () => {
  it('should create a new user', async () => {
    const result = await Effect.runPromise(
      createUser('New User', 'new@example.com').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result.name).toBe('New User')
    expect(result.email).toBe('new@example.com')
    expect(result.id).toBeDefined()
  })

  it('should return the created user with an id', async () => {
    const result = await Effect.runPromise(
      createUser('Test', 'test@test.com').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result.id).toBeTruthy()
    expect(typeof result.id).toBe('string')
  })

  it('should set emailVerified to false by default', async () => {
    const result = await Effect.runPromise(
      createUser('Test', 'test@test.com').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result.emailVerified).toBe(false)
  })
})
