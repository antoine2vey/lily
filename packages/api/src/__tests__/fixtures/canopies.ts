import type { MockCanopyMember } from '@lily/api/__tests__/mocks/canopy.repository'
import type { canopies } from '@lily/db/schema'

export const mockCanopy: typeof canopies.$inferSelect = {
  id: 'canopy-1',
  name: 'Home',
  timezone: 'Europe/Paris',
  latitude: null,
  longitude: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

export const createTestMembership = (
  overrides: Partial<MockCanopyMember> = {}
): MockCanopyMember => ({
  userId: 'user-1',
  canopyId: mockCanopy.id,
  role: 'member',
  joinedAt: new Date('2024-01-02'),
  canopy: mockCanopy,
  ...overrides,
})

export const mockCanopyMembers: MockCanopyMember[] = [
  createTestMembership({ userId: 'user-1', role: 'owner' }),
  createTestMembership({ userId: 'user-2' }),
]
