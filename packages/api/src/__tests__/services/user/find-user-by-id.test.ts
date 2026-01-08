import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { findUserById } from '@lily/api/services/user/endpoints/find-user-by-id'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('findUserById', () => {
  it('should return user when found', async () => {
    const result = await Effect.runPromise(
      findUserById('user-1').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result).toEqual(mockUsers[0])
  })

  it('should fail with UserNotFoundError when user not found', async () => {
    const result = await Effect.runPromiseExit(
      findUserById('non-existent').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when store is empty', async () => {
    const result = await Effect.runPromiseExit(
      findUserById('any-id').pipe(Effect.provide(createMockUserRepository([])))
    )

    expect(result._tag).toBe('Failure')
  })
})
