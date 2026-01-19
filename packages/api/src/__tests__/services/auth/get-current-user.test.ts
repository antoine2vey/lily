import {
  createMockCurrentUser,
  mockUserProfile,
} from '@lily/api/__tests__/mocks/auth'
import { getCurrentUser } from '@lily/api/services/auth/endpoints/get-current-user'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getCurrentUser', () => {
  it('should return user profile when authenticated', async () => {
    const result = await Effect.runPromise(
      getCurrentUser().pipe(
        Effect.provide(createMockCurrentUser(mockUserProfile))
      )
    )

    expect(result.id).toBe(mockUserProfile.id)
    expect(result.email).toBe(mockUserProfile.email)
    expect(result.name).toBe(mockUserProfile.name)
    expect(result.role).toBe(mockUserProfile.role)
    expect(result.status).toBe(mockUserProfile.status)
  })

  it('should return user profile with correct fields', async () => {
    const customUser = {
      ...mockUserProfile,
      id: 'custom-user-id',
      email: 'custom@example.com',
      name: 'Custom User',
      role: 'admin' as const,
    }

    const result = await Effect.runPromise(
      getCurrentUser().pipe(Effect.provide(createMockCurrentUser(customUser)))
    )

    expect(result.id).toBe('custom-user-id')
    expect(result.email).toBe('custom@example.com')
    expect(result.name).toBe('Custom User')
    expect(result.role).toBe('admin')
    expect(result.status).toBe('active')
  })
})
