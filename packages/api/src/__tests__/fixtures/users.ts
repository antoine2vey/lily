import type { User } from '@lily/shared'

export const mockUsers: User[] = [
  {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    emailVerified: true,
    image: null,
  },
  {
    id: 'user-2',
    name: 'Another User',
    email: 'another@example.com',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    emailVerified: false,
    image: 'https://example.com/avatar.png',
  },
]

export const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: `user-${crypto.randomUUID()}`,
  name: 'Test User',
  email: 'test@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
  emailVerified: false,
  image: null,
  ...overrides,
})
