import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { getUser } from '@lily/api/services/admin/endpoints/get-user'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getUser', () => {
  it('should return user when found', async () => {
    const result = await Effect.runPromise(
      getUser('user-1').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(result.id).toBe('user-1')
    expect(result.email).toBe('test@example.com')
  })

  it('should fail with UserNotFoundError when user not found', async () => {
    const result = await Effect.runPromiseExit(
      getUser('non-existent').pipe(
        Effect.provide(createMockUserRepository(mockUsers))
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = result.cause
      expect(error._tag).toBe('Fail')
    }
  })
})
