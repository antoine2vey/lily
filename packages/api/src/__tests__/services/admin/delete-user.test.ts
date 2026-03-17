import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { deleteUser } from '@lily/api/services/admin/endpoints/delete-user'
import { AdminUser } from '@lily/api/services/admin/middleware'
import type { UserProfile } from '@lily/shared/auth'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const mockAdminContext: UserProfile = {
  id: mockAdminUser.id,
  email: mockAdminUser.email,
  name: mockAdminUser.name,
  username: mockAdminUser.name ?? undefined,
  createdAt: mockAdminUser.createdAt,
  updatedAt: mockAdminUser.updatedAt,
  role: mockAdminUser.role,
  status: mockAdminUser.status,
}

const mockAdminLayer = Layer.succeed(AdminUser, mockAdminContext)

describe('deleteUser', () => {
  it('should delete user', async () => {
    const result = await Effect.runPromise(
      deleteUser('user-1').pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.id).toBe('user-1')
  })

  it('should fail when user not found', async () => {
    const result = await Effect.runPromiseExit(
      deleteUser('non-existent').pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should fail when trying to delete self', async () => {
    const result = await Effect.runPromiseExit(
      deleteUser(mockAdminUser.id).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository([mockAdminUser]), mockAdminLayer)
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})
