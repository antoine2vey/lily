import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { updateRole } from '@lily/api/services/admin/endpoints/update-role'
import { AdminUser } from '@lily/api/services/admin/middleware'
import type { UserProfile } from '@lily/shared/auth'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const mockAdminContext: UserProfile = {
  id: mockAdminUser.id,
  email: mockAdminUser.email,
  name: mockAdminUser.name,
  firstName: null,
  lastName: null,
  username: mockAdminUser.name ?? undefined,
  createdAt: mockAdminUser.createdAt,
  updatedAt: mockAdminUser.updatedAt,
  role: mockAdminUser.role,
  status: mockAdminUser.status,
}

const mockAdminLayer = Layer.succeed(AdminUser, mockAdminContext)

describe('updateRole', () => {
  it('should update user role', async () => {
    const result = await Effect.runPromise(
      updateRole('user-1', 'admin').pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.role).toBe('admin')
  })

  it('should fail when user not found', async () => {
    const result = await Effect.runPromiseExit(
      updateRole('non-existent', 'admin').pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should fail when trying to modify own role', async () => {
    const result = await Effect.runPromiseExit(
      updateRole(mockAdminUser.id, 'user').pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository([mockAdminUser]), mockAdminLayer)
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})
