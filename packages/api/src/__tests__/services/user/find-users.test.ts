import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { findUsers } from '@lily/api/services/user/endpoints/find-users'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('findUsers', () => {
  it('should return all users', async () => {
    const result = await Effect.runPromise(
      findUsers().pipe(Effect.provide(createMockUserRepository(mockUsers)))
    )

    expect(result).toEqual(mockUsers)
  })

  it('should return an array', async () => {
    const result = await Effect.runPromise(
      findUsers().pipe(Effect.provide(createMockUserRepository(mockUsers)))
    )

    expect(Array.isArray(result)).toBe(true)
  })

  it('should return empty array when no users exist', async () => {
    const result = await Effect.runPromise(
      findUsers().pipe(Effect.provide(createMockUserRepository([])))
    )

    expect(result).toEqual([])
  })
})
