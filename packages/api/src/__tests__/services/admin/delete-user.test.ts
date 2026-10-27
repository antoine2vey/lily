import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
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
  firstName: null,
  lastName: null,
  username: mockAdminUser.name ?? undefined,
  createdAt: mockAdminUser.createdAt,
  updatedAt: mockAdminUser.updatedAt,
  role: mockAdminUser.role,
  status: mockAdminUser.status,
}

const mockAdminLayer = Layer.mergeAll(
  Layer.succeed(AdminUser, mockAdminContext),
  createMockCanopyRepository(),
  createMockCareScheduleRepository(),
  createMockDelegationRepository(),
  createMockNotificationRepository([]),
  createMockMessageQueue(),
  MockSqlClientLive
)

describe('deleteUser', () => {
  it('should delete user', async () => {
    const result = await Effect.runPromise(
      deleteUser('user-1').pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository([...mockUsers]), mockAdminLayer)
        )
      )
    )

    expect(result.id).toBe('user-1')
  })

  it('should fail when user not found', async () => {
    const result = await Effect.runPromiseExit(
      deleteUser('non-existent').pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository([...mockUsers]), mockAdminLayer)
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
