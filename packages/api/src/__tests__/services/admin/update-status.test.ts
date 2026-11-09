import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRecipientRepository } from '@lily/api/__tests__/mocks/recipient.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { updateStatus } from '@lily/api/services/admin/endpoints/update-status'
import { AdminUser } from '@lily/api/services/admin/middleware'
import type { UserProfile } from '@lily/shared/auth'
import type { User } from '@lily/shared/user'
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

const asAdmin = (users: User[]) =>
  Layer.mergeAll(
    createMockUserRepository(users),
    Layer.succeed(AdminUser, mockAdminContext),
    createMockCanopyRepository(),
    createMockCareScheduleRepository(),
    createMockDelegationRepository(),
    createMockNotificationRepository([]),
    createMockPlantRepository({ plants: [] }),
    createMockRecipientRepository(),
    MockSqlClientLive
  )

describe('updateStatus', () => {
  it('should update user status to suspended', async () => {
    const result = await Effect.runPromise(
      updateStatus('user-1', 'suspended').pipe(
        Effect.provide(asAdmin([...mockUsers]))
      )
    )

    expect(result.status).toBe('suspended')
  })

  it('should update user status to banned', async () => {
    const result = await Effect.runPromise(
      updateStatus('user-1', 'banned').pipe(
        Effect.provide(asAdmin([...mockUsers]))
      )
    )

    expect(result.status).toBe('banned')
  })

  it('should fail when user not found', async () => {
    const result = await Effect.runPromiseExit(
      updateStatus('non-existent', 'suspended').pipe(
        Effect.provide(asAdmin([...mockUsers]))
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should fail when trying to modify own status', async () => {
    const result = await Effect.runPromiseExit(
      updateStatus(mockAdminUser.id, 'suspended').pipe(
        Effect.provide(asAdmin([mockAdminUser]))
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})
