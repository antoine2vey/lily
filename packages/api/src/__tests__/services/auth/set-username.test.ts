import {
  mockUser1,
  mockUser2,
  mockUsers,
} from '@lily/api/__tests__/fixtures/users'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { setUsername } from '@lily/api/services/auth/endpoints/set-username'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('setUsername', () => {
  const createTestLayer = (
    options: {
      currentUser?: typeof mockUserProfile
      users?: typeof mockUsers
    } = {}
  ) => {
    const currentUser = options.currentUser ?? mockUserProfile
    const users = options.users ?? mockUsers

    return Layer.mergeAll(
      createMockUserRepository(users),
      Layer.succeed(CurrentUser, currentUser)
    )
  }

  it('should update username successfully', async () => {
    const result = await Effect.runPromise(
      setUsername({ username: 'newusername' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('newusername')
    expect(result.id).toBe(mockUserProfile.id)
  })

  it('should fail when username too short', async () => {
    const result = await Effect.runPromiseExit(
      setUsername({ username: 'ab' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when username too long', async () => {
    const longUsername = 'a'.repeat(31)
    const result = await Effect.runPromiseExit(
      setUsername({ username: longUsername }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with invalid characters', async () => {
    const result = await Effect.runPromiseExit(
      setUsername({ username: 'invalid@name!' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail with spaces in username', async () => {
    const result = await Effect.runPromiseExit(
      setUsername({ username: 'invalid name' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when username already taken', async () => {
    const result = await Effect.runPromiseExit(
      setUsername({ username: mockUser2.name }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should allow same username for same user', async () => {
    const currentUser = {
      ...mockUserProfile,
      name: 'existingname',
    }
    const users = [{ ...mockUser1, id: currentUser.id, name: 'existingname' }]

    const result = await Effect.runPromise(
      setUsername({ username: 'existingname' }).pipe(
        Effect.provide(createTestLayer({ currentUser, users }))
      )
    )

    expect(result.name).toBe('existingname')
  })

  it('should return updated user profile', async () => {
    const result = await Effect.runPromise(
      setUsername({ username: 'validusername' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('email')
    expect(result).toHaveProperty('name')
    expect(result).toHaveProperty('createdAt')
    expect(result).toHaveProperty('updatedAt')
    expect(result).toHaveProperty('role')
    expect(result).toHaveProperty('status')
  })

  it('should accept username with underscores', async () => {
    const result = await Effect.runPromise(
      setUsername({ username: 'valid_user_name' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('valid_user_name')
  })

  it('should accept username with numbers', async () => {
    const result = await Effect.runPromise(
      setUsername({ username: 'user123' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('user123')
  })

  it('should trim whitespace from username', async () => {
    const result = await Effect.runPromise(
      setUsername({ username: '  validname  ' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe('validname')
  })

  it('should accept exactly 3 character username', async () => {
    const result = await Effect.runPromise(
      setUsername({ username: 'abc' }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.name).toBe('abc')
  })

  it('should accept exactly 30 character username', async () => {
    const maxUsername = 'a'.repeat(30)
    const result = await Effect.runPromise(
      setUsername({ username: maxUsername }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.name).toBe(maxUsername)
  })
})
