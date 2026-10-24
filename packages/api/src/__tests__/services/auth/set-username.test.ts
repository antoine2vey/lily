import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import {
  mockUser1,
  mockUser2,
  mockUsers,
} from '@lily/api/__tests__/fixtures/users'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { setUsername } from '@lily/api/services/auth/endpoints/set-username'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { AuthError } from '@lily/shared'
import { Effect, Exit, Layer, Option, Predicate, pipe } from 'effect'
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
      createMockRateLimiterService(),
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
      setUsername({ username: mockUser2.name ?? 'taken-username' }).pipe(
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

  it('should fail when user update returns null', async () => {
    // CurrentUser context has user-1, but users array is empty so update returns null
    const result = await Effect.runPromiseExit(
      setUsername({ username: 'newname' }).pipe(
        Effect.provide(
          createTestLayer({
            currentUser: mockUserProfile,
            users: [],
          })
        )
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should skip uniqueness check when username is same as current', async () => {
    const currentUser = {
      ...mockUserProfile,
      name: 'samename',
    }
    const users = [
      { ...mockUser1, id: currentUser.id, name: 'samename' },
      { ...mockUser2, name: 'samename' },
    ]

    const result = await Effect.runPromise(
      setUsername({ username: 'samename' }).pipe(
        Effect.provide(createTestLayer({ currentUser, users }))
      )
    )

    expect(result.name).toBe('samename')
  })

  describe('handle rules', () => {
    const currentUser = { ...mockUserProfile, name: 'my_handle' }
    const users = [
      { ...mockUser1, id: currentUser.id, name: 'my_handle' },
      { ...mockUser2, name: 'lilytester1' },
    ]

    const attempt = (
      username: string,
      layer = createTestLayer({ currentUser, users })
    ) =>
      Effect.runPromiseExit(
        setUsername({ username }).pipe(Effect.provide(layer))
      )

    const messageOf = (exit: Exit.Exit<unknown, unknown>) =>
      pipe(
        failureOf(exit),
        Option.fromNullishOr,
        Option.flatMap(Option.liftPredicate(Predicate.isTagged('AuthError'))),
        Option.map((error) => (error as AuthError).message),
        Option.getOrUndefined
      )

    it('treats a handle that differs only in case as taken', async () => {
      expect(messageOf(await attempt('LilyTester1'))).toBe(
        'Username is already taken'
      )
    })

    it.each(['admin', 'Admin', 'SUPPORT', 'lily'])(
      'refuses the reserved handle %s',
      async (username) => {
        expect(messageOf(await attempt(username))).toBe(
          'This username is reserved'
        )
      }
    )

    it('lets you change only the case of your own handle', async () => {
      expect(Exit.isSuccess(await attempt('My_Handle'))).toBe(true)
    })

    it('limits a user to five renames a day', async () => {
      const layer = createTestLayer({ currentUser, users })
      const outcomes = []
      for (const name of [
        'one_a',
        'two_b',
        'three_c',
        'four_d',
        'five_e',
        'six_f',
      ]) {
        const exit = await attempt(name, layer)
        outcomes.push(
          Exit.isSuccess(exit)
            ? 'ok'
            : (failureOf(exit) as { _tag: string })._tag
        )
      }

      expect(outcomes).toEqual([
        'ok',
        'ok',
        'ok',
        'ok',
        'ok',
        'RateLimitExceededError',
      ])
    })
  })
})
