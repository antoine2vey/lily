import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { updateUser } from '@lily/api/services/admin/endpoints/update-user'
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

describe('updateUser', () => {
  it('should update user name', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { name: 'Updated Name' }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.name).toBe('Updated Name')
  })

  it('should update user email', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { email: 'newemail@example.com' }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.email).toBe('newemail@example.com')
  })

  it('should update user bio', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { bio: 'New bio description' }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.bio).toBe('New bio description')
  })

  it('should update user status', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { status: 'suspended' }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.status).toBe('suspended')
  })

  it('should fail when user not found', async () => {
    const result = await Effect.runPromiseExit(
      updateUser('non-existent', { name: 'New Name' }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should fail when admin tries to modify own status', async () => {
    const result = await Effect.runPromiseExit(
      updateUser(mockAdminUser.id, { status: 'suspended' }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository([mockAdminUser]), mockAdminLayer)
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('should allow admin to modify own non-status fields', async () => {
    const result = await Effect.runPromise(
      updateUser(mockAdminUser.id, { name: 'Updated Admin Name' }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository([mockAdminUser]), mockAdminLayer)
        )
      )
    )

    expect(result.name).toBe('Updated Admin Name')
  })

  it('should allow partial updates', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { name: 'Only Name Updated' }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.name).toBe('Only Name Updated')
    expect(result.email).toBe('test@example.com') // Original email
  })

  it('should update multiple fields at once', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', {
        name: 'New Name',
        email: 'new@example.com',
        bio: 'New bio',
      }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.name).toBe('New Name')
    expect(result.email).toBe('new@example.com')
    expect(result.bio).toBe('New bio')
  })

  it('should update user image', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', {
        image: 'https://example.com/new-avatar.png',
      }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.image).toBe('https://example.com/new-avatar.png')
  })

  it('should update emailVerified status', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { emailVerified: false }).pipe(
        Effect.provide(
          Layer.merge(createMockUserRepository(mockUsers), mockAdminLayer)
        )
      )
    )

    expect(result.emailVerified).toBe(false)
  })
})
