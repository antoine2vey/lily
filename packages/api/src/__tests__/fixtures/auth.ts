import type { UserProfile } from '@lily/shared/auth'

export const mockUserProfiles: UserProfile[] = [
  {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    role: 'user',
    status: 'active',
  },
  {
    id: 'user-2',
    email: 'another@example.com',
    name: 'Another User',
    username: undefined,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    role: 'user',
    status: 'active',
  },
]

const defaultMockUser = mockUserProfiles[0]

if (!defaultMockUser) {
  throw new Error('mockUserProfiles must have at least one user')
}

export const mockSession = {
  user: defaultMockUser,
  session: {
    id: 'session-1',
    userId: 'user-1',
    expiresAt: new Date('2025-01-01'),
  },
}

export const createTestUserProfile = (
  overrides: Partial<UserProfile> = {}
): UserProfile => ({
  id: `user-${crypto.randomUUID()}`,
  email: 'test@example.com',
  name: 'Test User',
  username: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: 'user',
  status: 'active',
  ...overrides,
})
