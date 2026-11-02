import type { MockMembership } from '@lily/api/__tests__/mocks/canopy.repository'
import type { CanopyId } from '@lily/shared'

export const mockCanopyId = 'canopy-1' as CanopyId

export const createTestMembership = (
  overrides: Partial<MockMembership> = {}
): MockMembership => ({
  userId: 'user-1',
  canopyId: mockCanopyId,
  role: 'member',
  joinedAt: new Date('2024-01-02'),
  ...overrides,
})
