import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { updateStatus } from '@lily/api/services/admin/endpoints/update-status'
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

describe('updateStatus', () => {
  it('should update user status to suspended', async () => {
    const result = await Effect.runPromise(
      updateStatus('user-1', 'suspended').pipe(
        Effect.provide(createMockUserRepository(mockUsers)),
        Effect.provide(mockAdminLayer)
      )
    )

    expect(result.status).toBe('suspended')
  })

  it('should update user status to banned', async () => {
    const result = await Effect.runPromise(
      updateStatus('user-1', 'banned').pipe(
        Effect.provide(createMockUserRepository(mockUsers)),
        Effect.provide(mockAdminLayer)
      )
    )

    expect(result.status).toBe('banned')
  })

  it('should fail when user not found', async () => {
    const result = await Effect.runPromiseExit(
      updateStatus('non-existent', 'suspended').pipe(
        Effect.provide(createMockUserRepository(mockUsers)),
        Effect.provide(mockAdminLayer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should fail when trying to modify own status', async () => {
    const result = await Effect.runPromiseExit(
      updateStatus(mockAdminUser.id, 'suspended').pipe(
        Effect.provide(createMockUserRepository([mockAdminUser])),
        Effect.provide(mockAdminLayer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})
