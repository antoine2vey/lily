import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { deleteUser } from '@lily/api/services/user/endpoints/delete-user'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('deleteUser', () => {
  it('should delete existing user', async () => {
    const result = await Effect.runPromise(
      deleteUser('user-1').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result.id).toBe('user-1')
  })

  it('should return the deleted user', async () => {
    const result = await Effect.runPromise(
      deleteUser('user-1').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result).toEqual(mockUsers[0])
  })

  it('should fail with UserNotFoundError when user not found', async () => {
    const result = await Effect.runPromiseExit(
      deleteUser('non-existent').pipe(
        Effect.provide(createMockUserRepository([]))
      )
    )

    expect(result._tag).toBe('Failure')
  })
})
