import {
  mockAdminUser,
  mockSuspendedUser,
  mockUsers,
} from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { listUsers } from '@lily/api/services/admin/endpoints/list-users'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const allUsers = [...mockUsers, mockAdminUser, mockSuspendedUser]

describe('listUsers', () => {
  it('should return paginated users', async () => {
    const result = await Effect.runPromise(
      listUsers({ page: '1', limit: '20' }).pipe(
        Effect.provide(createMockUserRepository(allUsers))
      )
    )

    expect(result.items).toHaveLength(4)
    expect(result.total).toBe(4)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should filter users by role', async () => {
    const result = await Effect.runPromise(
      listUsers({ page: '1', limit: '20', role: 'admin' }).pipe(
        Effect.provide(createMockUserRepository(allUsers))
      )
    )

    expect(result.items).toHaveLength(1)
    const firstItem = result.items[0]
    expect(firstItem).toBeDefined()
    expect(firstItem!.role).toBe('admin')
  })

  it('should filter users by status', async () => {
    const result = await Effect.runPromise(
      listUsers({ page: '1', limit: '20', status: 'suspended' }).pipe(
        Effect.provide(createMockUserRepository(allUsers))
      )
    )

    expect(result.items).toHaveLength(1)
    const firstItem = result.items[0]
    expect(firstItem).toBeDefined()
    expect(firstItem!.status).toBe('suspended')
  })

  it('should search users by email', async () => {
    const result = await Effect.runPromise(
      listUsers({ page: '1', limit: '20', search: 'admin' }).pipe(
        Effect.provide(createMockUserRepository(allUsers))
      )
    )

    expect(result.items).toHaveLength(1)
    const firstItem = result.items[0]
    expect(firstItem).toBeDefined()
    expect(firstItem!.email).toContain('admin')
  })

  it('should search users by name', async () => {
    const result = await Effect.runPromise(
      listUsers({ page: '1', limit: '20', search: 'Another' }).pipe(
        Effect.provide(createMockUserRepository(allUsers))
      )
    )

    expect(result.items).toHaveLength(1)
    const firstItem = result.items[0]
    expect(firstItem).toBeDefined()
    expect(firstItem!.name).toBe('Another User')
  })

  it('should paginate correctly', async () => {
    const result = await Effect.runPromise(
      listUsers({ page: '1', limit: '2' }).pipe(
        Effect.provide(createMockUserRepository(allUsers))
      )
    )

    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(4)
    expect(result.hasMore).toBe(true)
  })
})
