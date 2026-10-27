import type { MockCanopyMember } from '@lily/api/__tests__/mocks/canopy.repository'

export const mockCanopyId = 'canopy-1'

export const createTestMembership = (
  overrides: Partial<MockCanopyMember> = {}
): MockCanopyMember => ({
  userId: 'user-1',
  canopyId: mockCanopyId,
  role: 'member',
  joinedAt: new Date('2024-01-02'),
  ...overrides,
})

export const mockCanopyMembers: MockCanopyMember[] = [
  createTestMembership({ userId: 'user-1', role: 'owner' }),
  createTestMembership({ userId: 'user-2' }),
]
