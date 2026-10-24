import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { checkUsername } from '@lily/api/services/username/endpoints/check-username'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('checkUsername', () => {
  const createTestLayer = () => createMockUserRepository([...mockUsers])

  it('should return available: true for unused username', async () => {
    const result = await Effect.runPromise(
      checkUsername('newusername').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.available).toBe(true)
    expect(result.username).toBe('newusername')
  })

  it('should return available: false for taken username', async () => {
    // mockUsers contains a user with name 'Test User'
    const result = await Effect.runPromise(
      checkUsername('Test User').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.available).toBe(false)
    expect(result.username).toBe('Test User')
  })

  it('should return the checked username in response', async () => {
    const username = 'testusername123'
    const result = await Effect.runPromise(
      checkUsername(username).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.username).toBe(username)
  })

  it('should handle usernames with different cases', async () => {
    const result = await Effect.runPromise(
      checkUsername('NewUsername').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.username).toBe('NewUsername')
    expect(result.available).toBe(true)
  })

  it('should handle usernames with numbers', async () => {
    const result = await Effect.runPromise(
      checkUsername('user123').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.username).toBe('user123')
  })

  it('reports an empty username as unavailable', async () => {
    const result = await Effect.runPromise(
      checkUsername('').pipe(Effect.provide(createTestLayer()))
    )

    // Empty string won't match any user name
    expect(result.available).toBe(false)
    expect(result.username).toBe('')
  })

  it('reports a username over 30 characters as unavailable', async () => {
    const longName = 'a'.repeat(255)
    const result = await Effect.runPromise(
      checkUsername(longName).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.available).toBe(false)
    expect(result.username).toBe(longName)
  })

  it('reports a username with characters outside [a-zA-Z0-9_] as unavailable', async () => {
    const result = await Effect.runPromise(
      checkUsername('user_name-123.test').pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.available).toBe(false)
    expect(result.username).toBe('user_name-123.test')
  })
})
