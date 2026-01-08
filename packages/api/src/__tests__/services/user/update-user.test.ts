import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { updateUser } from '@lily/api/services/user/endpoints/update-user'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('updateUser', () => {
  it('should update user fields', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { name: 'Updated Name' }).pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result.name).toBe('Updated Name')
  })

  it('should fail with UserNotFoundError when user not found', async () => {
    const result = await Effect.runPromiseExit(
      updateUser('non-existent', { name: 'Test' }).pipe(
        Effect.provide(createMockUserRepository([]))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should preserve other fields when updating', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { name: 'Updated Name' }).pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result.email).toBe(mockUsers[0]?.email)
    expect(result.id).toBe('user-1')
  })
})
