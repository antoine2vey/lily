import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { checkUsername } from '@lily/api/services/username/endpoints/check-username'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('checkUsername', () => {
  const users = [
    ...mockUsers,
    { ...mockUsers[0]!, id: 'user-handle', name: 'taken_handle' },
  ]
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockUserRepository(users),
      createMockRateLimiterService(),
      createMockCurrentUser({ id: 'user-1' })
    )

  it('should return available: true for unused username', async () => {
    const result = await Effect.runPromise(
      checkUsername('newusername').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.available).toBe(true)
    expect(result.username).toBe('newusername')
  })

  it('reports a handle taken in another case as unavailable', async () => {
    const result = await Effect.runPromise(
      checkUsername('Taken_Handle').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.available).toBe(false)
    expect(result.username).toBe('Taken_Handle')
  })

  it('reports a reserved handle as unavailable', async () => {
    const result = await Effect.runPromise(
      checkUsername('admin').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.available).toBe(false)
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
